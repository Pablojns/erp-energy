import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../common/audit.service';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { ProductCategoryModule } from '../product-category/product-category.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PermissionsModule,
    ProductCategoryModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, AuditService],
})
export class ProductModule {}
