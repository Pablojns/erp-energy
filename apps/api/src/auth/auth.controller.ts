import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthService } from './auth.service';
import type { AuthUser } from './interfaces/auth-user.interface';
import { JwtGuard } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtGuard)
  @Post('register')
  register(
    @Body() registerDto: RegisterDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtGuard)
  @Get('users')
  listUsers(@CurrentUser() user: AuthUser) {
    if (
      !user.roles.includes('ADMIN') &&
      !user.roles.includes('OPERADOR')
    ) {
      throw new ForbiddenException('Acesso restrito.');
    }
    return this.authService.listUsers();
  }

  @UseGuards(JwtGuard)
  @Patch('users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    return this.authService.updateUser(id, dto, user.id);
  }

  @UseGuards(JwtGuard)
  @Patch('users/:id/reset-password')
  resetUserPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    return this.authService.resetUserPassword(id, dto);
  }
}
