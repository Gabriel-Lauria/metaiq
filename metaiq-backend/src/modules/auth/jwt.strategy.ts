import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: { sub: string; email: string; role?: Role; managerId?: string | null }) {
    const { sub: userId } = payload;
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.active) {
      throw new UnauthorizedException();
    }

    const { password: _password, refreshToken: _refreshToken, ...safeUser } = user;
    return {
      ...safeUser,
      role: safeUser.role ?? payload.role ?? Role.OPERATIONAL,
      managerId: safeUser.managerId ?? payload.managerId ?? null,
    };
  }
}
