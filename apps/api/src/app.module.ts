import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { LeadsModule } from './leads/leads.module'
import { WhatsAppModule } from './whatsapp/whatsapp.module'
import { AuthModule } from './auth/auth.module'
import { resolve } from 'path'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        // When running from compiled dist (NODE runs from project root or dist)
        resolve(__dirname, '../../.env'),
        // When running via workspace scripts (cwd at repo root)
        resolve(process.cwd(), '.env'),
        // Fallback to default .env resolution in current working directory
        '.env',
      ],
    }),
    PrismaModule,
    AuthModule,
    LeadsModule,
    WhatsAppModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
