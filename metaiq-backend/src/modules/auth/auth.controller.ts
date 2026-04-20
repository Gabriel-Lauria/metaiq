import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60 } })
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
  @Throttle({ default: { limit: 10, ttl: 60 } })
  async refresh(
    @Body() body: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = body?.refreshToken || this.extractRefreshTokenFromCookies(request);
    const authResponse = await this.authService.refreshTokens(refreshToken || '');
    this.setRefreshTokenCookie(response, authResponse.refreshToken);
    const { refreshToken: _refreshToken, ...safeResponse } = authResponse;
    return safeResponse;
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authResponse = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.name,
    );
    this.setRefreshTokenCookie(response, authResponse.refreshToken);
    const { refreshToken: _refreshToken, ...safeResponse } = authResponse;
    return safeResponse;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Body() body: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = body?.refreshToken || this.extractRefreshTokenFromCookies(request);
    await this.authService.logoutByRefreshToken(refreshToken);
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
