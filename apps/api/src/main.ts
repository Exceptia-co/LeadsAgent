import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const isProduction = process.env.NODE_ENV === 'production';

  // Security: Helmet middleware for HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false, // Disable in dev for hot reload
      crossOriginEmbedderPolicy: false, // Allow embedding for Clerk
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger configuration - ONLY in development
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('LeadsCRM API')
      .setDescription('API for LeadsCRM - WhatsApp Lead Management with AI')
      .setVersion('1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      })
      .addTag('leads')
      .addTag('messaging')
      .addTag('ai')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    console.log(
      `📚 Swagger docs available at http://localhost:${process.env.PORT || process.env.API_PORT || 3003}/api/docs`,
    );
  }

  const port = process.env.PORT || process.env.API_PORT || 3003;
  await app.listen(port, '0.0.0.0');

  console.log(
    `🚀 LeadsCRM API running on port ${port} (${isProduction ? 'production' : 'development'})`,
  );
  console.log(`🔒 Security headers enabled via Helmet`);
}
bootstrap();
