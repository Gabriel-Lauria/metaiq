import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>('app');

  // Global exception filter
  const globalExceptionFilter = app.get(GlobalExceptionFilter);
  app.useGlobalFilters(globalExceptionFilter);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"]
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  }));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    disableErrorMessages: appConfig.nodeEnv === 'production',
  }));

const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:63769',
];

app.enableCors({
  origin: true,
  credentials: true,
});
  app.setGlobalPrefix('api');

  await app.listen(appConfig.port);

  console.log(`
╔════════════════════════════════════════════╗
║      🚀 MetaIQ Backend Server             ║
╠════════════════════════════════════════════╣
║                                            ║
║  🌐 URL: http://localhost:${appConfig.port}           ║
║  📊 API: http://localhost:${appConfig.port}/api       ║
║  🏥 Health: http://localhost:${appConfig.port}/health ║
║                                            ║
╚════════════════════════════════════════════╝
  `);
}

bootstrap().catch((err) => {
  console.error('❌ Erro ao iniciar servidor:', err);
  process.exit(1);
});
