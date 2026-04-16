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
import { AdAccount } from '../../ad-accounts/ad-account.entity';
import { Campaign } from '../../campaigns/campaign.entity';
import { StoreIntegration } from '../store-integration.entity';
import { MetaAdAccountDto, MetaCampaignDto } from './dto/meta-integration.dto';
import { MetaIntegrationService } from './meta.service';

@Injectable()
export class MetaSyncService {
  private readonly logger = new Logger(MetaSyncService.name);

  constructor(
    @InjectRepository(StoreIntegration)
    private readonly integrationRepository: Repository<StoreIntegration>,
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly accessScope: AccessScopeService,
    private readonly metaService: MetaIntegrationService,
  ) {}

  async fetchAdAccounts(storeId: string, requester: AuthenticatedUser): Promise<MetaAdAccountDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getReadyIntegration(storeId);

    try {
      return this.metaService.normalizeAdAccounts(
        await this.metaService.fetchAdAccountsRaw(integration.accessToken),
      );
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      throw this.toHttpError(err, 'Erro ao buscar Ad Accounts da Meta');
    }
  }

  async syncAdAccounts(storeId: string, requester: AuthenticatedUser): Promise<MetaAdAccountDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getReadyIntegration(storeId);

    if (integration.lastSyncStatus === SyncStatus.IN_PROGRESS) {
      throw new ConflictException('Sincronização já em andamento');
    }

    this.logger.log(`Meta ad account sync started | storeId=${storeId} | requester=${requester.id}`);
    integration.lastSyncStatus = SyncStatus.IN_PROGRESS;
    integration.lastSyncError = null;
    await this.integrationRepository.save(integration);

    try {
      const accounts = this.metaService.normalizeAdAccounts(
        await this.metaService.fetchAdAccountsRaw(integration.accessToken),
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
      this.logger.log(`Meta ad account sync finished | storeId=${storeId} | accounts=${accounts.length}`);
      return accounts;
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      this.logger.error(`Meta ad account sync failed | storeId=${storeId} | error=${this.errorMessage(err)}`);
      throw this.toHttpError(err, 'Erro ao sincronizar Ad Accounts da Meta');
    }
  }

  async fetchCampaigns(
    storeId: string,
    adAccountId: string,
    requester: AuthenticatedUser,
  ): Promise<MetaCampaignDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getReadyIntegration(storeId);
    const adAccount = await this.getMetaAdAccountInStore(adAccountId, storeId);

    try {
      return this.metaService.normalizeCampaigns(
        await this.metaService.fetchCampaignsRaw(adAccount.externalId || adAccount.metaId, integration.accessToken),
      );
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      throw this.toHttpError(err, 'Erro ao buscar campaigns da Meta');
    }
  }

  async syncCampaigns(
    storeId: string,
    adAccountId: string,
    requester: AuthenticatedUser,
  ): Promise<MetaCampaignDto[]> {
    await this.validateCanManage(storeId, requester);
    const integration = await this.getReadyIntegration(storeId);
    const adAccount = await this.getMetaAdAccountInStore(adAccountId, storeId);

    if (integration.lastSyncStatus === SyncStatus.IN_PROGRESS) {
      throw new ConflictException('Sincronização já em andamento');
    }

    this.logger.log(`Meta campaign sync started | storeId=${storeId} | adAccountId=${adAccountId} | requester=${requester.id}`);
    integration.lastSyncStatus = SyncStatus.IN_PROGRESS;
    integration.lastSyncError = null;
    await this.integrationRepository.save(integration);

    try {
      const campaigns = this.metaService.normalizeCampaigns(
        await this.metaService.fetchCampaignsRaw(adAccount.externalId || adAccount.metaId, integration.accessToken),
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
            objective: 'CONVERSIONS',
            dailyBudget: 0,
            startTime: now,
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
      this.logger.log(`Meta campaign sync finished | storeId=${storeId} | adAccountId=${adAccountId} | campaigns=${campaigns.length}`);
      return campaigns;
    } catch (err) {
      await this.recordSyncFailure(integration, this.resolveMetaErrorCode(err), err);
      this.logger.error(`Meta campaign sync failed | storeId=${storeId} | adAccountId=${adAccountId} | error=${this.errorMessage(err)}`);
      throw this.toHttpError(err, 'Erro ao sincronizar campaigns da Meta');
    }
  }

  private async validateCanManage(storeId: string, user: AuthenticatedUser): Promise<void> {
    await this.accessScope.validateStoreAccess(user, storeId);
    if (![Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER].includes(user.role)) {
      throw new ForbiddenException('Apenas ADMIN ou MANAGER podem gerenciar integrações');
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

  private async getMetaAdAccountInStore(adAccountId: string, storeId: string): Promise<AdAccount> {
    const adAccount = await this.adAccountRepository.findOne({
      where: {
        id: adAccountId,
        storeId,
        provider: IntegrationProvider.META,
      },
    });

    if (!adAccount) {
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
    integration.lastSyncStatus = SyncStatus.ERROR;
    integration.lastSyncError = code;

    if (code === 'TOKEN_INVALID') {
      integration.status = IntegrationStatus.ERROR;
    }

    await this.integrationRepository.save(integration);
    this.logger.warn(
      `Meta sync failure recorded | storeId=${integration.storeId} | code=${code} | error=${this.errorMessage(err)}`,
    );
  }

  private resolveMetaErrorCode(err: unknown): string {
    const code = (err as any)?.response?.data?.error?.code;
    const status = (err as any)?.response?.status;
    if (status === 401 || code === 190) {
      return 'TOKEN_INVALID';
    }
    if (code === 4) {
      return 'RATE_LIMIT';
    }
    return this.sanitizeError(
      (err as any)?.response?.data?.error?.message || this.errorMessage(err) || 'META_SYNC_ERROR',
    );
  }

  private toHttpError(err: unknown, fallback: string): Error {
    const code = (err as any)?.response?.data?.error?.code;
    const status = (err as any)?.response?.status;
    if (status === 401 || code === 190) {
      return new UnauthorizedException('Token Meta inválido ou expirado. Reconecte a store.');
    }
    if (code === 4) {
      return new HttpException('Limite da Meta atingido. Tente novamente em instantes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return new BadRequestException(`${fallback}: ${this.sanitizeError(this.errorMessage(err))}`);
  }

  private errorMessage(err: unknown): string {
    return (err as any)?.response?.data?.error?.message || (err as Error)?.message || 'erro desconhecido';
  }

  private sanitizeError(message: string): string {
    return message.replace(/[?&](access_token|client_secret|code)=[^&\s]+/gi, '$1=[redacted]').slice(0, 500);
  }
}
