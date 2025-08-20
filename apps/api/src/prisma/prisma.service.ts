import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit() {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('✅ Database connection established successfully');
    } catch (error) {
      this.connected = false;
      this.logger.error('❌ Failed to connect to database:', error.message);
      this.logger.warn('⚠️  API will start but database operations will fail');
      this.logger.warn('⚠️  Please verify your DATABASE_URL configuration');
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect();
    }
  }

  // Helper method to check if database is connected
  isConnected(): boolean {
    return this.connected;
  }
}
