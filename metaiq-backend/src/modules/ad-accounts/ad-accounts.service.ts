import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdAccount } from './ad-account.entity';
import { CreateAdAccountDto, UpdateAdAccountDto } from './dto/ad-account.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { Campaign } from '../campaigns/campaign.entity';

@Injectable()
export class AdAccountsService {
  constructor(
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    private readonly accessScope: AccessScopeService,
  ) {}

  /**
   * Cria uma nova conta de anúncios
   */
  async createForUser(user: AuthenticatedUser, dto: CreateAdAccountDto): Promise<AdAccount> {
    await this.accessScope.validateStoreAccess(user, dto.storeId);

    const adAccount = this.adAccountRepository.create({
      ...dto,
      userId: user.id,
      storeId: dto.storeId,
    });
    const saved = await this.adAccountRepository.save(adAccount);
    delete (saved as Partial<AdAccount>).accessToken;
    return saved;
  }

  /**
   * Busca conta por ID com validação de ownership
   */
  async findOneForUser(user: AuthenticatedUser, id: string): Promise<AdAccount> {
    if (!user.id) {
      throw new ForbiddenException('Usuário autenticado inválido');
    }

    return this.accessScope.validateAdAccountAccess(user, id);
  }

  /**
   * Lista todas as contas de um usuário
   */
  async findAllForUser(user: AuthenticatedUser, storeId?: string): Promise<AdAccount[]> {
    if (!user.id) {
      throw new ForbiddenException('Usuário autenticado inválido');
    }

    const query = this.adAccountRepository
      .createQueryBuilder('adAccount')
      .leftJoinAndSelect('adAccount.store', 'store');
    await this.accessScope.applyAdAccountScope(query, 'adAccount', user);

    if (storeId) {
      await this.accessScope.validateStoreAccess(user, storeId);
      query.andWhere('adAccount.storeId = :storeId', { storeId });
    }

    return query.getMany();
  }

  /**
   * Lista todas as contas
   */
  async updateForUser(user: AuthenticatedUser, id: string, dto: UpdateAdAccountDto): Promise<AdAccount> {
    const adAccount = await this.findOneForUser(user, id);
    if (dto.storeId !== undefined) {
      await this.accessScope.validateStoreAccess(user, dto.storeId);
      if (dto.storeId !== adAccount.storeId) {
        await this.assertCanMoveStore(id);
      }
    }
    Object.assign(adAccount, dto);
    return this.adAccountRepository.save(adAccount);
  }

  /**
   * Delete (soft delete — desativa) com validação de ownership
   */
  async removeForUser(user: AuthenticatedUser, id: string): Promise<void> {
    const adAccount = await this.findOneForUser(user, id);
    adAccount.active = false;
    await this.adAccountRepository.save(adAccount);
  }

  /**
   * Busca conta por Meta ID (com validação de ownership)
   */
  async findByMetaIdForUser(user: AuthenticatedUser, metaId: string): Promise<AdAccount | null> {
    if (!user.id) {
      throw new ForbiddenException('Usuário autenticado inválido');
    }

    const query = this.adAccountRepository
      .createQueryBuilder('adAccount')
      .where('adAccount.metaId = :metaId', { metaId });
    await this.accessScope.applyAdAccountScope(query, 'adAccount', user);
    return query.getOne();
  }

  private async assertCanMoveStore(adAccountId: string): Promise<void> {
    const campaignCount = await this.adAccountRepository.manager.count(Campaign, {
      where: { adAccountId },
    });

    if (campaignCount > 0) {
      throw new BadRequestException(
        'Não é possível alterar storeId de AdAccount com campanhas vinculadas',
      );
    }
  }
}
