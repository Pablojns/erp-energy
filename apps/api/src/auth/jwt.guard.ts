import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './interfaces/auth-user.interface';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  private devUser: AuthUser | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.configService.get<string>('AUTH_DISABLED') === 'true') {
      const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
      request.user = await this.resolveDevUser();
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  private async resolveDevUser(): Promise<AuthUser> {
    if (this.devUser) {
      return this.devUser;
    }

    const user = await this.prismaService.client.user.findFirst({
      where: {
        isActive: true,
        userRoles: { some: { role: { name: 'ADMIN' } } },
      },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'AUTH_DISABLED: nenhum usuário ADMIN no banco.',
      );
    }

    this.devUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      roles: user.userRoles.map((userRole) => userRole.role.name),
    };

    return this.devUser;
  }
}
