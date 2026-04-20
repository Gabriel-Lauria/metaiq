import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>('app') as AppConfig;
  if (!appConfig) {
    throw new Error('Missing app configuration');
  }

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
    appConfig.frontendUrl,
    'http://localhost:4200',
    'http://localhost:63769',
  ].filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
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
