import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IsNull, Repository } from 'typeorm';
import { AccountType, Role } from '../../common/enums';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { AuthenticatedUser } from '../../common/interfaces';

interface JwtPayload {
  sub: string;
  email: string;
  role?: Role;
  sessionVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private configService: ConfigService,
  ) {
    const jwtSecret = configService.get<string>('jwt.secret');
    if (!jwtSecret) {
      throw new Error('JWT secret is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const { sub: userId } = payload;
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException();
    }

    if (payload.sessionVersion !== user.sessionVersion) {
      throw new UnauthorizedException();
    }

    if (!this.isValidRole(user.role)) {
      throw new UnauthorizedException();
    }

    const accountType = await this.resolveAccountType(user.tenantId);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      managerId: user.managerId,
      tenantId: user.tenantId,
      accountType,
    };
  }

  private isValidRole(role: unknown): role is Role {
    return Object.values(Role).includes(role as Role);
  }

  private async resolveAccountType(tenantId?: string | null): Promise<AccountType | null> {
    if (!tenantId) {
      return null;
    }

    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId, deletedAt: IsNull() },
      select: ['id', 'accountType'],
    });

    return tenant?.accountType ?? AccountType.AGENCY;
  }
}
