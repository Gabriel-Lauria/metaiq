import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/app.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
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

  const configuredOrigins = appConfig.corsOrigins?.length
    ? appConfig.corsOrigins
    : [appConfig.frontendUrl].filter(Boolean);
  const localOrigins = ['http://localhost:4200', 'http://localhost:63769'];
  const allowedOrigins = appConfig.nodeEnv === 'production'
    ? configuredOrigins
    : Array.from(new Set([...configuredOrigins, ...localOrigins]));

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

  logger.log(JSON.stringify({
    event: 'APPLICATION_STARTED',
    port: appConfig.port,
    environment: appConfig.nodeEnv,
    health: `/api/health`,
    ready: `/api/ready`,
    corsOrigins: allowedOrigins,
  }));
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Erro ao iniciar servidor', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
