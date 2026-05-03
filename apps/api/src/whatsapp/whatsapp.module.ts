import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhitelistService } from './whitelist.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhitelistService],
  exports: [WhatsAppService, WhitelistService],
})
export class WhatsAppModule {}
