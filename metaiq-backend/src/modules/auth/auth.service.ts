import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';

interface JwtPayload {
  sub: string;
  email: string;
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
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return this.buildAuthResponse(user, tokens);
  }

  async register(email: string, password: string, name: string) {
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
    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const tokens = await this.rotateRefreshToken(user, refreshToken);
    return this.buildAuthResponse(user, tokens);
  }

  private async validateRefreshToken(refreshToken: string): Promise<JwtPayload> {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });
    } catch (error) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Usuário não encontrado ou refresh token inválido');
    }

    if (!this.isRefreshTokenValid(refreshToken, user.refreshToken)) {
      await this.updateRefreshToken(user.id, null);
      throw new UnauthorizedException('Refresh token inválido - sessão comprometida');
    }

    return payload;
  }

  private async generateTokens(user: User) {
    const payload = this.buildPayload(user);
    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') || '15m';
    const refreshTokenExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET');

    const accessToken = this.jwtService.sign({ ...payload, jti: randomUUID() }, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: accessTokenExpiresIn as any,
    });

    const refreshToken = this.jwtService.sign({ ...payload, jti: randomUUID() }, {
      secret: refreshSecret,
      expiresIn: refreshTokenExpiresIn as any,
    });

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
        role: 'admin',
      },
    };
  }

  private buildPayload(user: User): JwtPayload {
    return { sub: user.id, email: user.email };
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
