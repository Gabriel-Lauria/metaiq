import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces';
import { AccessScopeService } from '../../../common/services/access-scope.service';
import { AuditService } from '../../../common/services/audit.service';
import { IncidentReporterService } from '../../../common/services/incident-reporter.service';
import { MetricsService } from '../../metrics/metrics.service';
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';
import { StoreIntegration } from '../store-integration.entity';
import { MetaAdAccountDto, MetaCampaignDto } from './dto/meta-integration.dto';
import { MetaGraphApiRetryContext } from './meta-graph-api.client';
import { MetaIntegrationService } from './meta.service';

interface MetricsSyncResult {
  campaigns: number;
  metricRows: number;
}

@Injectable()
export class MetaSyncService {
  private readonly logger = new Logger(MetaSyncService.name);
  private readonly syncLockTtlMs = 15 * 60 * 1000;
  private readonly metricsLookbackDays = 7;

  constructor(
    @InjectRepository(StoreIntegration)
    private readonly integrationRepository: Repository<StoreIntegration>,
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly accessScope: AccessScopeService,
    private readonly metaService: MetaIntegrationService,
    private readonly incidentReporter: IncidentReporterService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
  ) {}

  async fetchAdAccountsForUser(requester: AuthenticatedUser, storeId: string): Promise<MetaAdAccountDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getReadyIntegration(storeId);

    try {
      return this.metaService.normalizeAdAccounts(
        await this.metaService.fetchAdAccountsRaw(
          integration.accessToken as string,
          this.buildRetryContext(storeId, requester, undefined, '/me/adaccounts'),
        ),
      );
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      throw this.toHttpError(err, 'Erro ao buscar Ad Accounts da Meta');
    }
  }

  async syncAdAccountsForUser(requester: AuthenticatedUser, storeId: string, requestId?: string): Promise<MetaAdAccountDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getReadyIntegration(storeId);

    await this.acquireSyncLock(integration, {
      requestId,
      actorId: requester.id,
      tenantId: requester.tenantId ?? null,
      storeId,
      action: 'meta.ad_accounts.sync',
    });
    const startedAt = Date.now();
    this.logSync('Meta ad account sync started', { requestId, storeId, requesterId: requester.id, status: SyncStatus.IN_PROGRESS });

    try {
      const accounts = this.metaService.normalizeAdAccounts(
        await this.metaService.fetchAdAccountsRaw(
          integration.accessToken as string,
          this.buildRetryContext(storeId, requester, requestId, '/me/adaccounts'),
        ),
      );
      const now = new Date();

      for (const account of accounts) {
        const existing = await this.adAccountRepository.findOne({
          where: {
            storeId,
            provider: IntegrationProvider.META,
            externalId: account.externalId,
          },
        });

        if (existing) {
          existing.name = account.name;
          existing.lastSeenAt = now;
          existing.syncStatus = SyncStatus.SUCCESS;
          existing.active = account.status === 'ACTIVE';
          await this.adAccountRepository.save(existing);
          continue;
        }

        await this.adAccountRepository.save(
          this.adAccountRepository.create({
            metaId: account.externalId,
            externalId: account.externalId,
            provider: IntegrationProvider.META,
            syncStatus: SyncStatus.SUCCESS,
            importedAt: now,
            lastSeenAt: now,
            name: account.name,
            userId: requester.id,
            storeId,
            active: account.status === 'ACTIVE',
          }),
        );
      }

      integration.lastSyncAt = now;
      integration.lastSyncStatus = SyncStatus.SUCCESS;
      integration.lastSyncError = null;
      await this.integrationRepository.save(integration);
      this.logSync('Meta ad account sync finished', { requestId, storeId, requesterId: requester.id, status: SyncStatus.SUCCESS, accounts: accounts.length, duration: Date.now() - startedAt });
      return accounts;
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      this.logSync('Meta ad account sync failed', { requestId, storeId, requesterId: requester.id, status: SyncStatus.ERROR, error: this.errorMessage(err), duration: Date.now() - startedAt }, 'error');
      throw this.toHttpError(err, 'Erro ao sincronizar Ad Accounts da Meta');
    }
  }

  async fetchCampaignsForUser(
    requester: AuthenticatedUser,
    storeId: string,
    adAccountId: string,
  ): Promise<MetaCampaignDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getReadyIntegration(storeId);
    const adAccount = await this.getMetaAdAccountInStore(adAccountId, storeId, requester);

    try {
      return this.metaService.normalizeCampaigns(
        await this.metaService.fetchCampaignsRaw(
          adAccount.externalId || adAccount.metaId,
          integration.accessToken as string,
          this.buildRetryContext(storeId, requester, undefined, `/${adAccount.externalId || adAccount.metaId}/campaigns`),
        ),
      );
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      throw this.toHttpError(err, 'Erro ao buscar campaigns da Meta');
    }
  }

  async syncCampaignsForUser(
    requester: AuthenticatedUser,
    storeId: string,
    adAccountId: string,
    requestId?: string,
  ): Promise<MetaCampaignDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getReadyIntegration(storeId);
    const adAccount = await this.getMetaAdAccountInStore(adAccountId, storeId, requester);

    await this.acquireSyncLock(integration, {
      requestId,
      actorId: requester.id,
      tenantId: requester.tenantId ?? null,
      storeId,
      action: 'meta.campaigns.sync',
    });
    const startedAt = Date.now();
    this.logSync('Meta campaign sync started', { requestId, storeId, adAccountId, requesterId: requester.id, status: SyncStatus.IN_PROGRESS });

    try {
      const campaigns = this.metaService.normalizeCampaigns(
        await this.metaService.fetchCampaignsRaw(
          adAccount.externalId || adAccount.metaId,
          integration.accessToken as string,
          this.buildRetryContext(storeId, requester, requestId, `/${adAccount.externalId || adAccount.metaId}/campaigns`),
        ),
      );
      const now = new Date();

      for (const campaign of campaigns) {
        const existing = await this.campaignRepository.findOne({
          where: {
            storeId,
            externalId: campaign.externalId,
          },
        });

        if (existing) {
          existing.name = campaign.name;
          existing.status = campaign.status;
          existing.objective = campaign.objective ?? existing.objective ?? null;
          existing.dailyBudget = campaign.dailyBudget ?? existing.dailyBudget ?? null;
          existing.startTime = campaign.startTime ?? existing.startTime ?? null;
          existing.endTime = campaign.endTime ?? existing.endTime ?? null;
          existing.adAccountId = adAccount.id;
          existing.lastSeenAt = now;
          await this.campaignRepository.save(existing);
          continue;
        }

        await this.campaignRepository.save(
          this.campaignRepository.create({
            metaId: campaign.externalId,
            externalId: campaign.externalId,
            name: campaign.name,
            status: campaign.status,
            objective: campaign.objective ?? null,
            dailyBudget: campaign.dailyBudget ?? null,
            startTime: campaign.startTime ?? null,
            endTime: campaign.endTime ?? null,
            userId: requester.id,
            createdByUserId: requester.id,
            storeId,
            adAccountId: adAccount.id,
            lastSeenAt: now,
          }),
        );
      }

      integration.lastSyncAt = now;
      integration.lastSyncStatus = SyncStatus.SUCCESS;
      integration.lastSyncError = null;
      await this.integrationRepository.save(integration);
      this.logSync('Meta campaign sync finished', { requestId, storeId, adAccountId, requesterId: requester.id, status: SyncStatus.SUCCESS, campaigns: campaigns.length, duration: Date.now() - startedAt });
      return campaigns;
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      this.logSync('Meta campaign sync failed', { requestId, storeId, adAccountId, requesterId: requester.id, status: SyncStatus.ERROR, error: this.errorMessage(err), duration: Date.now() - startedAt }, 'error');
      throw this.toHttpError(err, 'Erro ao sincronizar campaigns da Meta');
    }
  }

  async syncMetricsForConnectedStores(): Promise<{ stores: number; campaigns: number; metricRows: number; errors: number }> {
    const integrations = await this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.provider = :provider', { provider: IntegrationProvider.META })
      .andWhere('integration.status = :status', { status: IntegrationStatus.CONNECTED })
      .addSelect(['integration.accessToken'])
      .getMany();

    let stores = 0;
    let campaigns = 0;
    let metricRows = 0;
    let errors = 0;

    for (const integration of integrations) {
      try {
        const result = await this.syncMetricsForIntegration(integration, undefined, 'cron-metric-sync');
        stores += 1;
        campaigns += result.campaigns;
        metricRows += result.metricRows;
      } catch (error) {
        errors += 1;
        this.logSync('Meta metrics sync failed for store', {
          storeId: integration.storeId,
          requestId: 'cron-metric-sync',
          error: this.errorMessage(error),
        }, 'error');
      }
    }

    return { stores, campaigns, metricRows, errors };
  }

  private async syncMetricsForIntegration(
    integration: StoreIntegration,
    requester?: AuthenticatedUser,
    requestId?: string,
  ): Promise<MetricsSyncResult> {
    await this.acquireSyncLock(integration, {
      requestId,
      actorId: requester?.id,
      tenantId: requester?.tenantId ?? null,
      storeId: integration.storeId,
      action: requester ? 'meta.metrics.sync' : 'meta.metrics.sync.system',
    });

    try {
      const dateRange = this.buildMetricsDateRange();
      const campaigns = await this.campaignRepository
        .createQueryBuilder('campaign')
        .where('campaign.storeId = :storeId', { storeId: integration.storeId })
        .andWhere('campaign.externalId IS NOT NULL')
        .andWhere('campaign.status IN (:...statuses)', { statuses: ['ACTIVE', 'PAUSED'] })
        .getMany();

      let metricRows = 0;

      for (const campaign of campaigns) {
        const rows = await this.metaService.fetchCampaignMetricsRaw(
          campaign.externalId as string,
          integration.accessToken as string,
          dateRange.since,
          dateRange.until,
          this.buildRetryContext(
            integration.storeId,
            requester,
            requestId,
            `/${campaign.externalId}/insights`,
          ),
        );

        for (const row of rows) {
          await this.metricsService.upsertDailyMetricForSystemJob({
            campaignId: campaign.id,
            date: row.date_start,
            impressions: Number(row.impressions || 0),
            clicks: Number(row.clicks || 0),
            spend: Number(row.spend || 0),
            conversions: this.sumMetaActionValues(row.actions),
            revenue: this.estimateMetaRevenue(row),
          });
          metricRows += 1;
        }
      }

      integration.lastSyncAt = new Date();
      integration.lastSyncStatus = SyncStatus.SUCCESS;
      integration.lastSyncError = null;
      await this.integrationRepository.save(integration);

      return {
        campaigns: campaigns.length,
        metricRows,
      };
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      throw err;
    }
  }

  private async acquireSyncLock(
    integration: StoreIntegration,
    context: {
      requestId?: string;
      actorId?: string;
      tenantId?: string | null;
      storeId: string;
      action: string;
    },
  ): Promise<void> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.syncLockTtlMs);

    if (
      integration.lastSyncStatus === SyncStatus.IN_PROGRESS
      && (!integration.lastSyncAt || integration.lastSyncAt.getTime() <= staleBefore.getTime())
    ) {
      integration.lastSyncStatus = SyncStatus.FAILED_RECOVERABLE;
      integration.lastSyncError = 'STALE_SYNC_LOCK_RECOVERED';
      integration.lastSyncAt = now;
      await this.integrationRepository.save(integration);
      this.auditService.record({
        action: `${context.action}.stale_recovery`,
        status: 'success',
        actorId: context.actorId ?? null,
        tenantId: context.tenantId ?? null,
        targetType: 'meta_sync',
        targetId: integration.id,
        requestId: context.requestId,
        reason: 'stale_sync_lock',
        metadata: {
          storeId: context.storeId,
          previousStatus: SyncStatus.IN_PROGRESS,
          recoveredTo: SyncStatus.FAILED_RECOVERABLE,
          previousLastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
        },
      });
    }

    const result = await this.integrationRepository
      .createQueryBuilder()
      .update(StoreIntegration)
      .set({
        lastSyncStatus: SyncStatus.IN_PROGRESS,
        lastSyncError: null,
        lastSyncAt: now,
      })
      .where('id = :id', { id: integration.id })
      .andWhere('("lastSyncStatus" != :inProgress OR "lastSyncAt" <= :staleBefore OR "lastSyncAt" IS NULL)', {
        inProgress: SyncStatus.IN_PROGRESS,
        staleBefore,
      })
      .execute();

    if (!result.affected) {
      throw new ConflictException('Sincronização já em andamento');
    }

    integration.lastSyncStatus = SyncStatus.IN_PROGRESS;
    integration.lastSyncError = null;
    integration.lastSyncAt = now;
  }

  private async validateCanManage(storeId: string, user: AuthenticatedUser): Promise<void> {
    await this.accessScope.validateStoreAccess(user, storeId);
    if (![Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL].includes(user.role)) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN, ADMIN, MANAGER e OPERATIONAL podem gerenciar integrações com Meta');
    }
  }

  private async getReadyIntegration(storeId: string): Promise<StoreIntegration> {
    const integration = await this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.storeId = :storeId', { storeId })
      .andWhere('integration.provider = :provider', { provider: IntegrationProvider.META })
      .addSelect(['integration.accessToken', 'integration.refreshToken'])
      .getOne();

    if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
      throw new BadRequestException('Store não está conectada à Meta');
    }

    if (!integration.accessToken) {
      await this.recordSyncFailure(integration, 'TOKEN_INVALID');
      throw new UnauthorizedException('Token Meta ausente. Reconecte a store.');
    }

    if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() < Date.now()) {
      integration.status = IntegrationStatus.EXPIRED;
      integration.lastSyncStatus = SyncStatus.ERROR;
      integration.lastSyncError = 'TOKEN_EXPIRED';
      await this.integrationRepository.save(integration);
      throw new UnauthorizedException('Token expirado');
    }

    return integration;
  }

  private async getMetaAdAccountInStore(
    adAccountId: string,
    storeId: string,
    requester: AuthenticatedUser,
  ): Promise<AdAccount> {
    const adAccount = await this.accessScope.validateAdAccountInStoreAccess(
      requester,
      storeId,
      adAccountId,
    );
    if (adAccount.provider !== IntegrationProvider.META) {
      throw new BadRequestException('AdAccount Meta não encontrada para a store informada');
    }

    if (!adAccount.externalId && !adAccount.metaId) {
      throw new BadRequestException('AdAccount Meta sem identificador externo');
    }

    return adAccount;
  }

  private async recordSyncFailure(
    integration: StoreIntegration,
    code: string,
    err?: unknown,
  ): Promise<void> {
    integration.lastSyncAt = new Date();
    integration.lastSyncStatus = code === 'STALE_SYNC_LOCK_RECOVERED'
      ? SyncStatus.FAILED_RECOVERABLE
      : SyncStatus.ERROR;
    integration.lastSyncError = code;

    if (code === 'TOKEN_INVALID') {
      integration.status = IntegrationStatus.ERROR;
    }

    await this.integrationRepository.save(integration);
    this.logger.warn(
      `Meta sync failure recorded | storeId=${integration.storeId} | code=${code} | error=${this.errorMessage(err)}`,
    );
    if (['TOKEN_INVALID', 'RATE_LIMIT'].includes(code)) {
      void this.incidentReporter.report({
        title: 'Falha operacional na integração Meta',
        severity: code === 'TOKEN_INVALID' ? 'high' : 'medium',
        source: 'meta-sync',
        summary: `Store ${integration.storeId} registrou ${code} durante sincronização`,
        details: {
          storeId: integration.storeId,
          code,
          status: integration.status,
          syncStatus: integration.lastSyncStatus,
          error: this.errorMessage(err),
        },
      });
    }
  }

  private resolveMetaErrorCode(err: unknown): string {
    const code = (err as any)?.payload?.metaCode ?? (err as any)?.response?.data?.error?.code;
    const status = (err as any)?.payload?.status ?? (err as any)?.response?.status;
    if (status === 401 || code === 190) {
      return 'TOKEN_INVALID';
    }
    if (code === 4 || status === 429) {
      return 'RATE_LIMIT';
    }
    return this.sanitizeError(
      (err as any)?.payload?.metaMessage
      || (err as any)?.response?.data?.error?.message
      || this.errorMessage(err)
      || 'META_SYNC_ERROR',
    );
  }

  private toHttpError(err: unknown, fallback: string): Error {
    const code = (err as any)?.payload?.metaCode ?? (err as any)?.response?.data?.error?.code;
    const status = (err as any)?.payload?.status ?? (err as any)?.response?.status;
    if (status === 401 || code === 190) {
      return new UnauthorizedException('Token Meta inválido ou expirado. Reconecte a store.');
    }
    if (code === 4 || status === 429) {
      return new HttpException('Limite da Meta atingido. Tente novamente em instantes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (status === 400 || code === 100) {
      return new BadRequestException(`${fallback}: ${this.sanitizeError(this.errorMessage(err))}`);
    }
    return new HttpException(`${fallback}: ${this.sanitizeError(this.errorMessage(err))}`, HttpStatus.BAD_GATEWAY);
  }

  private buildRetryContext(
    storeId: string,
    requester: AuthenticatedUser | undefined,
    requestId: string | undefined,
    endpoint: string,
  ): MetaGraphApiRetryContext {
    return {
      requestId,
      actorId: requester?.id,
      tenantId: requester?.tenantId ?? null,
      storeId,
      endpoint,
    };
  }

  private buildMetricsDateRange(): { since: string; until: string } {
    const until = new Date();
    const since = new Date();
    since.setDate(until.getDate() - this.metricsLookbackDays);

    return {
      since: since.toISOString().split('T')[0],
      until: until.toISOString().split('T')[0],
    };
  }

  private sumMetaActionValues(actions: unknown): number {
    if (!Array.isArray(actions)) {
      return 0;
    }

    const relevantActionTypes = new Set([
      'lead',
      'omni_lead',
      'onsite_conversion.lead_grouped',
      'offsite_conversion.fb_pixel_lead',
      'purchase',
      'omni_purchase',
      'offsite_conversion.fb_pixel_purchase',
    ]);

    return actions.reduce((total, action) => {
      const type = typeof action?.action_type === 'string' ? action.action_type : '';
      if (!relevantActionTypes.has(type)) {
        return total;
      }

      return total + (Number(action?.value) || 0);
    }, 0);
  }

  private estimateMetaRevenue(row: any): number {
    const spend = Number(row?.spend || 0);
    const purchaseRoasEntry = Array.isArray(row?.purchase_roas) ? row.purchase_roas[0] : null;
    const roas = Number(purchaseRoasEntry?.value || 0);
    return Number.isFinite(roas) && roas > 0 ? spend * roas : 0;
  }

  private errorMessage(err: unknown): string {
    return (err as any)?.payload?.metaMessage
      || (err as any)?.response?.data?.error?.message
      || (err as Error)?.message
      || 'erro desconhecido';
  }

  private sanitizeError(message: string): string {
    return message.replace(/[?&](access_token|client_secret|code)=[^&\s]+/gi, '$1=[redacted]').slice(0, 500);
  }

  private logSync(message: string, payload: Record<string, unknown>, level: 'log' | 'warn' | 'error' = 'log'): void {
    this.logger[level](JSON.stringify({ event: 'META_SYNC', message, ...payload }));
  }
}
