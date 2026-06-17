import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthUser } from './interfaces/auth-user.interface';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

type UserWithRoles = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  passwordHash: string;
  userRoles: Array<{
    role: {
      name: string;
    };
  }>;
};

type LinkedUserRoleRow = {
  roleId: string;
};

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAdminRole();
    await this.ensureDefaultUserRole();
    await this.ensureInitialAdminUser();
  }

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();
    const existingUser = await this.prismaService.client.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already in use.');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 12);

    const userRole = await this.prismaService.client.role.upsert({
      where: { name: 'USER' },
      update: {},
      create: { name: 'USER', description: 'Default ERP user role' },
    });

    const user = await this.prismaService.client.user.create({
      data: {
        name: registerDto.name.trim(),
        email,
        passwordHash,
        userRoles: {
          create: {
            roleId: userRole.id,
          },
        },
      },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.prismaService.client.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.buildAuthResponse(user);
  }

  async listUsers() {
    const users = await this.prismaService.client.user.findMany({
      orderBy: { name: 'asc' },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    // Nunca expõe passwordHash — serializa apenas dados públicos.
    return users.map((user: UserWithRoles) => this.serializeUser(user));
  }

  async me(userId: string) {
    const user = await this.prismaService.client.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive.');
    }

    return {
      user: this.serializeUser(user),
    };
  }

  private serializeUser(user: UserWithRoles): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      roles: user.userRoles.map(
        (userRole: UserWithRoles['userRoles'][number]) => userRole.role.name,
      ),
    };
  }

  private async buildAuthResponse(user: UserWithRoles) {
    const serializedUser = this.serializeUser(user);
    const payload: JwtPayload = {
      sub: serializedUser.id,
      email: serializedUser.email,
      roles: serializedUser.roles,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN') ?? '1d',
      user: serializedUser,
    };
  }

  private async ensureAdminRole(): Promise<void> {
    await this.prismaService.client.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: {
        name: 'ADMIN',
        description: 'System administrator role',
      },
    });
  }

  private async ensureDefaultUserRole(): Promise<void> {
    await this.prismaService.client.role.upsert({
      where: { name: 'USER' },
      update: {},
      create: {
        name: 'USER',
        description: 'Default ERP user role',
      },
    });
  }

  private async ensureInitialAdminUser(): Promise<void> {
    const adminEmail = (
      this.configService.get<string>('ADMIN_EMAIL') ?? 'admin@erp.local'
    )
      .trim()
      .toLowerCase();
    const adminPassword =
      this.configService.get<string>('ADMIN_PASSWORD') ?? 'Admin@123';
    const adminName = (
      this.configService.get<string>('ADMIN_NAME') ?? 'ERP Admin'
    ).trim();

    const adminRole = await this.prismaService.client.role.findUnique({
      where: { name: 'ADMIN' },
    });

    if (!adminRole) {
      return;
    }

    const existingAdmin = await this.prismaService.client.user.findUnique({
      where: { email: adminEmail },
      include: {
        userRoles: true,
      },
    });

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await this.prismaService.client.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          passwordHash,
          isActive: true,
          userRoles: {
            create: {
              roleId: adminRole.id,
            },
          },
        },
      });
      return;
    }

    const alreadyHasAdminRole = existingAdmin.userRoles.some(
      (userRole: LinkedUserRoleRow) => userRole.roleId === adminRole.id,
    );

    if (!alreadyHasAdminRole) {
      await this.prismaService.client.userRole.create({
        data: {
          userId: existingAdmin.id,
          roleId: adminRole.id,
        },
      });
    }
  }
}
