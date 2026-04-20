import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { AuthService, AuthenticatedUser } from './auth.service';
import { LoginDto } from './dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';

const COOKIE_NAME = 'access_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    const user = await this.auth.validateCredentials(dto.email, dto.password);
    const token = this.auth.signTokenFor(user);
    res.cookie(COOKIE_NAME, token, this.cookieOptions());
    return { user: this.auth.toPublic(user), token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(COOKIE_NAME, { ...this.cookieOptions(), maxAge: 0 });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private cookieOptions() {
    const secure = this.config.get<string>('COOKIE_SECURE', 'false') === 'true';
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 1000 * 60 * 60 * 12, // 12h
    };
  }
}
