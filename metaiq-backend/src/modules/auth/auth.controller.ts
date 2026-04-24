import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authResponse = await this.authService.login(loginDto.email, loginDto.password);
    this.setRefreshTokenCookie(response, authResponse.refreshToken);
    const { refreshToken: _refreshToken, ...safeResponse } = authResponse;
    return safeResponse;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.extractRefreshTokenFromCookies(request);
    const authResponse = await this.authService.refreshTokens(refreshToken || '');
    this.setRefreshTokenCookie(response, authResponse.refreshToken);
    const { refreshToken: _refreshToken, ...safeResponse } = authResponse;
    return safeResponse;
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authResponse = await this.authService.register(registerDto);
    this.setRefreshTokenCookie(response, authResponse.refreshToken);
    const { refreshToken: _refreshToken, ...safeResponse } = authResponse;
    return safeResponse;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.extractRefreshTokenFromCookies(request);
    const accessToken = this.extractAccessToken(request);
    await this.authService.logoutByRefreshToken(refreshToken);
    if (!refreshToken) {
      await this.authService.logoutByAccessToken(accessToken);
    }
    response.clearCookie('metaiq_refresh_token', this.cookieOptions());
    return { success: true };
  }

  private setRefreshTokenCookie(response: Response, refreshToken: string): void {
    response.cookie('metaiq_refresh_token', refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.parseRefreshTokenMaxAgeMs(),
    });
  }

  private extractRefreshTokenFromCookies(request: Request): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }

    return cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('metaiq_refresh_token='))
      ?.slice('metaiq_refresh_token='.length);
  }

  private extractAccessToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      return undefined;
    }

    return authorization.slice('Bearer '.length).trim();
  }

  private cookieOptions() {
    const isProduction = this.configService.get<string>('app.nodeEnv') === 'production';
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isProduction,
      path: '/api/auth',
    };
  }

  private parseRefreshTokenMaxAgeMs(): number {
    const configured = this.configService.get<string>('jwt.refreshExpiresIn') || '7d';
    const match = /^(\d+)([smhd])$/i.exec(configured.trim());
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit === 's'
      ? 1000
      : unit === 'm'
        ? 60_000
        : unit === 'h'
          ? 3_600_000
          : 86_400_000;

    return value * multiplier;
  }
}
