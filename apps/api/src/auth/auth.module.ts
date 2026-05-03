import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [ClerkAuthGuard, TenantContextGuard],
  exports: [ClerkAuthGuard, TenantContextGuard],
})
export class AuthModule {}
