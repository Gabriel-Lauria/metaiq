import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/interfaces';
import { Role } from '../../../common/enums';
import { AuditService } from '../../../common/services/audit.service';
import { MetaCampaignRecoveryService } from './meta-campaign-recovery.service';
import { RetryPartialCampaignDto, CleanupPartialResourcesDto } from './dto/meta-integration.dto';

/**
 * Endpoints para recuperação de campanhas criadas parcialmente na Meta
 *
 * Quando uma criação falha no meio (ex: adset, creative, ad),
 * estes endpoints permitem:
 *
 * 1. GET /recovery/:executionId — Ver status de execução parcial
 * 2. POST /recovery/:executionId/retry — Tentar continuar criação
 * 3. POST /recovery/:executionId/cleanup — Remover recursos parciais
 */
@Controller('integrations/meta/stores/:storeId/campaigns/recovery')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL)
export class MetaCampaignRecoveryController {
  constructor(
    private readonly recoveryService: MetaCampaignRecoveryService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /recovery/:executionId
   *
   * Obtém informações sobre uma execução de criação de campanha
   * (especialmente útil para verificar status de execuções PARTIAL)
   *
   * Resposta:
   * {
   *   "id": "execution-id",
   *   "status": "PARTIAL",
   *   "step": "adset",
   *   "message": "erro ao criar adset",
   *   "partialIds": {
   *     "campaign": "120245670684470319",
   *     "adset": null,
   *     "creative": null,
   *     "ad": null
   *   }
   * }
   */
  @Get(':executionId')
  async getStatus(
    @Param('storeId') storeId: string,
    @Param('executionId') executionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recoveryService.getExecutionStatusForUser(user, storeId, executionId);
  }

  /**
   * POST /recovery/:executionId/retry
   *
   * Retoma uma criação de campanha que parou no meio
   *
   * Fluxo:
   * 1. Campaign foi criado ✅ (ID: 120245670684470319)
   * 2. AdSet falhou ❌
   * 3. Chama este endpoint → tenta criar AdSet, Creative, Ad
   *
   * Body:
   * {
   *   "accessToken": "token-meta",
   *   "adAccountExternalId": "act_123456789",
   *   "pageId": "seu-page-id",
   *   "destinationUrl": "https://seu-site.com",
   *   "objective": "CONVERSIONS",
   *   "name": "Nome da Campanha",
   *   "dailyBudget": 50,
   *   "country": "BR",
   *   "initialStatus": "PAUSED",
   *   "message": "Seu texto de anúncio"
   * }
   *
   * Resposta (sucesso):
   * {
   *   "success": true,
   *   "message": "Campanha retomada e concluída com sucesso",
   *   "ids": {
   *     "campaignId": "120245670684470319",
   *     "adSetId": "23842705685680319",
   *     "creativeId": "120245670684470320",
   *     "adId": "120245670684470321"
   *   }
   * }
   */
  @Post(':executionId/retry')
  async retryPartialCreation(
    @Param('storeId') storeId: string,
    @Param('executionId') executionId: string,
    @Body() dto: RetryPartialCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.recoveryService.retryPartialCampaignCreationForUser(user, storeId, executionId, dto);
    this.audit(user, req, 'meta.campaign.retry', executionId, storeId, { success: result.success });
    return result;
  }

  /**
   * POST /recovery/:executionId/cleanup
   *
   * Remove recursos que foram criados parcialmente na Meta
   *
   * Útil quando:
   * - Usuário quer desistir da campanha
   * - Quer tentar novamente com configuração diferente
   * - Quer limpar antes de usar nova idempotencyKey
   *
   * Body:
   * {
   *   "accessToken": "token-meta",
   *   "adAccountExternalId": "act_123456789"
   * }
   *
   * Resposta:
   * {
   *   "success": true,
   *   "message": "Limpeza concluída",
   *   "cleaned": {
   *     "ad": true,
   *     "creative": true,
   *     "adset": true,
   *     "campaign": true
   *   }
   * }
   */
  @Post(':executionId/cleanup')
  async cleanupPartialResources(
    @Param('storeId') storeId: string,
    @Param('executionId') executionId: string,
    @Body() dto: CleanupPartialResourcesDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const result = await this.recoveryService.cleanupPartialResourcesForUser(user, storeId, executionId);
    this.audit(user, req, 'meta.campaign.cleanup', executionId, storeId, { cleaned: result.cleaned });
    return result;
  }

  private audit(
    user: AuthenticatedUser,
    req: Request,
    action: string,
    executionId: string,
    storeId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.auditService.record({
      action,
      status: 'success',
      actorId: user.id,
      actorRole: user.role,
      tenantId: user.tenantId,
      targetType: 'meta_campaign_creation',
      targetId: executionId,
      requestId: req.requestId,
      metadata: {
        storeId,
        executionId,
        ...metadata,
      },
    });
  }
}
