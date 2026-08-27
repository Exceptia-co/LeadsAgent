import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded, type Request } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const isProduction = process.env.NODE_ENV === 'production';

  // Capture rawBody so signature-verifying webhook handlers can recompute a
  // digest over the exact bytes received. The WhatsApp webhook that
  // originally needed this was retired on 2026-08-27; the Clerk
  // Organizations webhook still needs it.
  app.use(
    json({
      limit: '1mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // Security: Helmet middleware for HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false, // Disable in dev for hot reload
      crossOriginEmbedderPolicy: false, // Allow embedding for Clerk
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
    ],
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
