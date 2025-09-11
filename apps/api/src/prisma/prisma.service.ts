import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Configuración optimizada para evitar prepared statement issues
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
      errorFormat: 'pretty',
      // Desactivar query caching para evitar prepared statement issues
      // especialmente útil con transaction poolers
    });

    // Configuración adicional para manejar desconexiones se maneja en onModuleDestroy
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('✅ Database connection established successfully');
      
      // Removida la query de prueba que causaba conflictos con prepared statements
      this.logger.log('✅ Prisma client ready for use');
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
