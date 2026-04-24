import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerService } from './services/logger.service';
import { AuditService } from './services/audit.service';
import { RetryService } from './services/retry.service';
import { MetricsService } from './services/metrics.service';
import { RequestContextService } from './services/request-context.service';
import { CurrentUserService } from './services/current-user.service';
import { AccessScopeService } from './services/access-scope.service';
import { AuditLog } from './entities/audit-log.entity';
import { Store } from '../modules/stores/store.entity';
import { UserStore } from '../modules/user-stores/user-store.entity';
import { User } from '../modules/users/user.entity';
import { OwnershipGuard } from './guards/ownership.guard';
import { ObservabilityController } from './controllers/observability.controller';

/**
 * CommonModule fornece serviços compartilhados usados por toda a aplicação.
 * 
 * Inclui:
 * - LoggerService: logging estruturado e consistente
 * - RetryService: retry com exponential backoff
 * - MetricsService: coleta de métricas de performance
 * - CurrentUserService: abstração do usuário autenticado
 * - Guards: JWT, Ownership, etc
 * - Decorators: CurrentUser, Throttle, etc
 * - Utils: crypto, metrics, pagination
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Store, UserStore, User])],
  providers: [
    RequestContextService,
    LoggerService,
    AuditService,
    RetryService,
    MetricsService,
    CurrentUserService,
    AccessScopeService,
    OwnershipGuard,
  ],
  controllers: [ObservabilityController],
  exports: [
    RequestContextService,
    LoggerService,
    AuditService,
    RetryService,
    MetricsService,
    CurrentUserService,
    AccessScopeService,
    OwnershipGuard,
  ],
})
export class CommonModule {}
