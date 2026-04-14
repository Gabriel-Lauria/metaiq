import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { Config } from './config/configuration';

async function bootstrap() {
  const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'CRYPTO_SECRET'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Variável de ambiente obrigatória não configurada: ${envVar}`);
      process.exit(1);
    }
  }

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const config = configService.get<Config>('config');

  // Global exception filter
  const globalExceptionFilter = app.get(GlobalExceptionFilter);
  app.useGlobalFilters(globalExceptionFilter);

  // ── Segurança: Helmet com CSP e HSTS ──────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", config.app.frontendUrl],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 ano
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: 'deny' }, // Previne clickjacking
      noSniff: true, // Previne MIME type sniffing
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // ── Validação global de DTOs ───────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: config.app.nodeEnv === 'production',
    }),
  );

  // ── Rate limiting global ────────────────────────────────────────────────
  // ThrottlerGuard protege contra abuso de API
  app.useGlobalGuards(app.get(ThrottlerGuard));

  // ── CORS seguro ────────────────────────────────────────────────────────
  app.enableCors({
    origin: config.app.frontendUrl,
    credentials: true, // Permite cookies e headers customizados
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600, // Pre-flight cache 1 hora
  });

  // ── Prefix global de API ────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  await app.listen(config.app.port);

  console.log(`
╔════════════════════════════════════════════╗
║      🚀 MetaIQ Backend Server              ║
╠════════════════════════════════════════════╣
║                                            ║
║  🌐 URL: http://localhost:${config.app.port}            ║
║  📊 API: http://localhost:${config.app.port}/api        ║
║  🏥 Health: http://localhost:${config.app.port}/api/health ║
║  🔒 Security: Helmet + JWT + Rate Limiting ║
║                                            ║
╚════════════════════════════════════════════╝
  `);
}

bootstrap().catch((err) => {
  console.error('❌ Erro ao iniciar servidor:', err);
  process.exit(1);
});

