import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccountType, Role } from '../../common/enums';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { Tenant } from '../tenants/tenant.entity';
import { AuditService } from '../../common/services/audit.service';
import { RegisterDto } from './dto/auth.dto';
import { Manager } from '../managers/manager.entity';
import { Store } from '../stores/store.entity';
import { UserStore } from '../user-stores/user-store.entity';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  sessionVersion: number;
  jti?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(UserStore)
    private userStoreRepository: Repository<UserStore>,
    private dataSource: DataSource,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
    if (!user) {
      this.auditAuth('auth.login', 'failure', { email }, 'invalid_credentials');
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.active) {
      await this.clearRefreshTokenForInactiveUser(user);
      this.auditAuth('auth.login', 'failure', user, 'inactive_user');
      throw new UnauthorizedException('Usuário inativo');
    }
    this.assertValidRole(user);

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.auditAuth('auth.login', 'failure', user, 'invalid_credentials');
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    this.auditAuth('auth.login', 'success', user);

    return this.buildAuthResponse(user, tokens);
  }

  async register(registerDto: RegisterDto) {
    if (!this.isPublicRegisterEnabled()) {
      throw new ForbiddenException('Registro público desabilitado');
    }

    const requestedAccountType = registerDto.accountType ?? AccountType.INDIVIDUAL;
    if (requestedAccountType !== AccountType.INDIVIDUAL) {
      throw new ForbiddenException('Cadastro público permite apenas contas INDIVIDUAL');
    }

    const { user, storeId } = await this.registerIndividual(registerDto);
    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    this.auditAuth('auth.register', 'success', user);

    return this.buildAuthResponse(user, tokens, {
      accountType: AccountType.INDIVIDUAL,
      storeId,
    });
  }

  async refreshTokens(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token não enviado');
    }

    const payload = await this.validateRefreshToken(refreshToken);
    const user = await this.userRepository.findOne({ where: { id: payload.sub, deletedAt: IsNull() } });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (!user.active) {
      await this.clearRefreshTokenForInactiveUser(user);
      throw new UnauthorizedException('Usuário inativo');
    }
    this.assertValidRole(user);

    const tokens = await this.rotateRefreshToken(user, refreshToken);
    this.auditAuth('auth.refresh', 'success', user);
    return this.buildAuthResponse(user, tokens);
  }

  async logoutByRefreshToken(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.validateRefreshToken(refreshToken);
      await this.invalidateUserSession(payload.sub);
      this.auditService.record({
        action: 'auth.logout',
        status: 'success',
        actorId: payload.sub,
      });
    } catch {
      this.auditService.record({
        action: 'auth.logout',
        status: 'failure',
        reason: 'stale_or_invalid_refresh_token',
      });
      // Logout should still succeed from the client perspective even if the token is stale.
    }
  }

  async logoutByAccessToken(accessToken?: string): Promise<void> {
    if (!accessToken) {
      return;
    }

    try {
      const payload = await this.validateAccessToken(accessToken);
      await this.invalidateUserSession(payload.sub);
      this.auditService.record({
        action: 'auth.logout',
        status: 'success',
        actorId: payload.sub,
      });
    } catch {
      this.auditService.record({
        action: 'auth.logout',
        status: 'failure',
        reason: 'stale_or_invalid_access_token',
      });
    }
  }

  private async validateRefreshToken(refreshToken: string): Promise<JwtPayload> {
    const refreshSecret =
      this.configService.get<string>('jwt.refreshSecret') ||
      this.configService.get<string>('jwt.secret');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub, deletedAt: IsNull() } });
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Usuário não encontrado ou refresh token inválido');
    }

    if (!user.active) {
      await this.clearRefreshTokenForInactiveUser(user);
      throw new UnauthorizedException('Usuário inativo');
    }
    this.assertValidRole(user);
    this.assertSessionVersion(payload, user);

    if (!this.isRefreshTokenValid(refreshToken, user.refreshToken)) {
      await this.updateRefreshToken(user.id, null);
      throw new UnauthorizedException('Refresh token inválido - sessão comprometida');
    }

    return payload;
  }

  private async validateAccessToken(accessToken: string): Promise<JwtPayload> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(accessToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('Access token inválido ou expirado');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub, deletedAt: IsNull() } });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (!user.active) {
      throw new UnauthorizedException('Usuário inativo');
    }
    this.assertValidRole(user);
    this.assertSessionVersion(payload, user);
    return payload;
  }

  private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.buildPayload(user);
    const accessTokenExpiresIn =
      this.configService.get<string>('jwt.expiresIn') || '15m';
    const refreshTokenExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '7d';
    const refreshSecret =
      this.configService.get<string>('jwt.refreshSecret') ||
      this.configService.get<string>('jwt.secret');

    const accessTokenOptions: JwtSignOptions = {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: accessTokenExpiresIn as StringValue,
    };

    const refreshTokenOptions: JwtSignOptions = {
      secret: refreshSecret,
      expiresIn: refreshTokenExpiresIn as StringValue,
    };

    const accessToken = this.jwtService.sign({ ...payload, jti: randomUUID() }, accessTokenOptions);
    const refreshToken = this.jwtService.sign({ ...payload, jti: randomUUID() }, refreshTokenOptions);

    return { accessToken, refreshToken };
  }

  private async rotateRefreshToken(user: User, oldRefreshToken: string) {
    await this.validateRefreshToken(oldRefreshToken);
    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  private async buildAuthResponse(
    user: User,
    tokens: { accessToken: string; refreshToken: string },
    context?: { accountType?: AccountType | null; storeId?: string | null },
  ) {
    const tenantProfile = await this.resolveTenantProfile(user.tenantId);
    const accountType = context?.accountType ?? tenantProfile?.accountType ?? null;
    const storeId = context?.storeId ?? await this.resolveStoreId(user.id, accountType);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        managerId: user.managerId,
        tenantId: user.tenantId,
        accountType,
        storeId,
        businessName: tenantProfile?.businessName ?? null,
        businessSegment: tenantProfile?.businessSegment ?? null,
        defaultCity: tenantProfile?.defaultCity ?? null,
        defaultState: tenantProfile?.defaultState ?? null,
        website: tenantProfile?.website ?? null,
        instagram: tenantProfile?.instagram ?? null,
        whatsapp: tenantProfile?.whatsapp ?? null,
      },
    };
  }

  private buildPayload(user: User): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion ?? 0,
    };
  }

  private async resolveAccountType(tenantId?: string | null): Promise<AccountType | null> {
    return (await this.resolveTenantProfile(tenantId))?.accountType ?? null;
  }

  private async resolveTenantProfile(tenantId?: string | null): Promise<Pick<Tenant, 'accountType' | 'businessName' | 'businessSegment' | 'defaultCity' | 'defaultState' | 'website' | 'instagram' | 'whatsapp'> | null> {
    if (!tenantId) {
      return null;
    }

    return this.tenantRepository.findOne({
      where: { id: tenantId, deletedAt: IsNull() },
      select: ['id', 'accountType', 'businessName', 'businessSegment', 'defaultCity', 'defaultState', 'website', 'instagram', 'whatsapp'],
    });
  }

  private async resolveStoreId(
    userId: string,
    accountType?: AccountType | null,
  ): Promise<string | null> {
    if (accountType !== AccountType.INDIVIDUAL) {
      return null;
    }

    const userStore = await this.userStoreRepository.findOne({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    return userStore?.storeId ?? null;
  }

  private async registerIndividual(registerDto: RegisterDto): Promise<{ user: User; storeId: string }> {
    const email = registerDto.email.trim().toLowerCase();
    const name = registerDto.name.trim();
    const businessName = registerDto.businessName.trim();
    const businessSegment = this.cleanNullable(registerDto.businessSegment);
    const defaultCity = this.cleanNullable(registerDto.defaultCity ?? registerDto.city);
    const defaultState = this.cleanNullable(registerDto.defaultState ?? registerDto.state)?.toUpperCase() ?? null;
    const website = this.cleanNullable(registerDto.website);
    const instagram = this.normalizeInstagram(registerDto.instagram);
    const whatsapp = this.cleanNullable(registerDto.whatsapp);
    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(User, { where: { email } });
      if (existing) {
        throw new ConflictException('Email já cadastrado');
      }

      const tenant = manager.create(Tenant, {
        name: businessName,
        accountType: AccountType.INDIVIDUAL,
        businessName,
        businessSegment,
        defaultCity,
        defaultState,
        website,
        instagram,
        whatsapp,
        email,
        contactName: name,
        active: true,
      });
      const savedTenant = await manager.save(Tenant, tenant);

      const internalManager = manager.create(Manager, {
        name: businessName,
        email,
        contactName: name,
        active: true,
        notes: 'Internal individual account bootstrap manager',
      });
      const savedManager = await manager.save(Manager, internalManager);

      const user = manager.create(User, {
        email,
        name,
        password: hashedPassword,
        role: Role.ADMIN,
        managerId: savedManager.id,
        tenantId: savedTenant.id,
        active: true,
      });
      const savedUser = await manager.save(User, user);

      const store = manager.create(Store, {
        name: businessName,
        managerId: savedManager.id,
        tenantId: savedTenant.id,
        createdByUserId: savedUser.id,
        active: true,
      });
      const savedStore = await manager.save(Store, store);

      const userStore = manager.create(UserStore, {
        userId: savedUser.id,
        storeId: savedStore.id,
      });
      await manager.save(UserStore, userStore);

      return {
        user: savedUser,
        storeId: savedStore.id,
      };
    });
  }

  private isPublicRegisterEnabled(): boolean {
    return this.configService.get<boolean>('app.enablePublicRegister') === true;
  }

  private assertValidRole(user: User): void {
    if (!Object.values(Role).includes(user.role)) {
      throw new UnauthorizedException('Role do usuário inválida');
    }
  }

  private async clearRefreshTokenForInactiveUser(user: User): Promise<void> {
    if (user.refreshToken) {
      await this.updateRefreshToken(user.id, null);
    }
  }

  private assertSessionVersion(payload: JwtPayload, user: User): void {
    if (payload.sessionVersion !== user.sessionVersion) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }
  }

  private async invalidateUserSession(userId: string): Promise<void> {
    await this.userRepository.increment({ id: userId, deletedAt: IsNull() }, 'sessionVersion', 1);
    await this.updateRefreshToken(userId, null);
  }

  private async updateRefreshToken(userId: string, refreshToken: string | null) {
    const hashedToken = refreshToken ? this.hashRefreshToken(refreshToken) : null;
    await this.userRepository.update(userId, { refreshToken: hashedToken });
  }

  private isRefreshTokenValid(refreshToken: string, hashedToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const tokenBuffer = Buffer.from(tokenHash, 'hex');
    const storedBuffer = Buffer.from(hashedToken, 'hex');
    return tokenBuffer.length === storedBuffer.length && timingSafeEqual(tokenBuffer, storedBuffer);
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private cleanNullable(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private auditAuth(
    action: string,
    status: 'success' | 'failure',
    userOrPayload: User | { email: string },
    reason?: string,
  ): void {
    const user = 'id' in userOrPayload ? userOrPayload : null;
    this.auditService.record({
      action,
      status,
      actorId: user?.id,
      actorRole: user?.role,
      tenantId: user?.tenantId,
      reason,
      metadata: {
        email: userOrPayload.email,
      },
    });
  }

  private normalizeInstagram(value?: string | null): string | null {
    const normalized = this.cleanNullable(value);
    if (!normalized) {
      return null;
    }

    return normalized.startsWith('@') ? normalized : `@${normalized}`;
  }
}
