import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { Campaign } from '../../modules/campaigns/campaign.entity';
import { Insight } from '../../modules/insights/insight.entity';
import { AdAccount } from '../../modules/ad-accounts/ad-account.entity';
import { AccessScopeService } from '../services/access-scope.service';
import {
  CHECK_OWNERSHIP_KEY,
  OwnershipMetadata,
} from '../decorators/check-ownership.decorator';

/**
 * OwnershipGuard verifica se o recurso acessado está no escopo do usuário autenticado.
 *
 * Uso:
 *   @Get(':id')
 *   @CheckOwnership('campaign')
 *   findOne(@Param('id') id: string) { ... }
 *
 * O guard:
 * 1. Lê metadata explícita do handler/classe via Reflector
 * 2. Extrai o id do parâmetro declarado no decorator
 * 3. Busca o recurso com filtro de escopo centralizado no AccessScopeService
 * 4. Nunca infere o tipo de recurso a partir da URL
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessScope: AccessScopeService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<OwnershipMetadata>(
      CHECK_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      throw new ForbiddenException('OwnershipGuard sem metadata de recurso');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const id = request.params?.[metadata.paramName];

    if (!user?.id) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (!id) {
      throw new ForbiddenException('ID do recurso não fornecido');
    }

    const hasAccess = await this.hasResourceAccess(metadata, id, user);
    if (!hasAccess) {
      throw new NotFoundException(`Recurso não encontrado`);
    }

    return true;
  }

  private async hasResourceAccess(
    metadata: OwnershipMetadata,
    id: string,
    user: any,
  ): Promise<boolean> {
    const campaignRepo = this.dataSource.getRepository(Campaign);
    const adAccountRepo = this.dataSource.getRepository(AdAccount);
    const insightRepo = this.dataSource.getRepository(Insight);

    if (metadata.resource === 'campaign') {
      const query = campaignRepo
        .createQueryBuilder('campaign')
        .where('campaign.id = :id', { id });
      await this.accessScope.applyCampaignScope(query, 'campaign', user);
      return (await query.getExists()) === true;
    }

    if (metadata.resource === 'adAccount') {
      const query = adAccountRepo
        .createQueryBuilder('adAccount')
        .where('adAccount.id = :id', { id });
      await this.accessScope.applyAdAccountScope(query, 'adAccount', user);
      return (await query.getExists()) === true;
    }

    const query = insightRepo
      .createQueryBuilder('insight')
      .innerJoin('insight.campaign', 'campaign')
      .where('insight.id = :id', { id });
    await this.accessScope.applyCampaignScope(query, 'campaign', user);
    return (await query.getExists()) === true;
  }
}
