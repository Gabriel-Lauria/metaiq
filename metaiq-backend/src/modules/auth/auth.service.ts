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
import { IsNull, Repository } from 'typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { Role } from '../../common/enums';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  jti?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.userRepository.findOne({ where: { email, deletedAt: IsNull() } });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.active) {
      await this.clearRefreshTokenForInactiveUser(user);
      throw new UnauthorizedException('Usuário inativo');
    }
    this.assertValidRole(user);

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return this.buildAuthResponse(user, tokens);
  }

  async register(email: string, password: string, name: string) {
    if (!this.isPublicRegisterEnabled()) {
      throw new ForbiddenException('Registro público desabilitado');
    }

    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = this.userRepository.create({
      email,
      name,
      password: hashedPassword,
      active: true,
    });

    await this.userRepository.save(user);
    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return this.buildAuthResponse(user, tokens);
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
    return this.buildAuthResponse(user, tokens);
  }

  async logoutByRefreshToken(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.validateRefreshToken(refreshToken);
      await this.updateRefreshToken(payload.sub, null);
    } catch {
      // Logout should still succeed from the client perspective even if the token is stale.
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

    if (!this.isRefreshTokenValid(refreshToken, user.refreshToken)) {
      await this.updateRefreshToken(user.id, null);
      throw new UnauthorizedException('Refresh token inválido - sessão comprometida');
    }

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

  private buildAuthResponse(user: User, tokens: { accessToken: string; refreshToken: string }) {
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
      },
    };
  }

  private buildPayload(user: User): JwtPayload {
    return { sub: user.id, email: user.email, role: user.role };
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
}
