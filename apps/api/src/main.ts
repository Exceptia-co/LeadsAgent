import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  
  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  })
  
  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  
  // Swagger configuration
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
    .build()
  
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)
  
  const port = process.env.API_PORT || 3003
  await app.listen(port)
  
  console.log(`🚀 LeadsCRM API running on port ${port}`)
  console.log(`📚 Swagger docs available at http://localhost:${port}/api/docs`)
}
bootstrap()
