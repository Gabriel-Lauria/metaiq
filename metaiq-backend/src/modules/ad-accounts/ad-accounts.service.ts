import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  async create(dto: CreateAdAccountDto, user: AuthenticatedUser): Promise<AdAccount> {
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
  async findOne(id: string, user: AuthenticatedUser): Promise<AdAccount> {
    if (!user.id) {
      throw new ForbiddenException('Usuário autenticado inválido');
    }

    const query = this.adAccountRepository
      .createQueryBuilder('adAccount')
      .leftJoinAndSelect('adAccount.store', 'store')
      .where('adAccount.id = :id', { id });
    await this.accessScope.applyAdAccountScope(query, 'adAccount', user);
    const adAccount = await query.getOne();
    if (!adAccount) {
      throw new NotFoundException(`Conta de anúncios ${id} não encontrada`);
    }

    return adAccount;
  }

  /**
   * Lista todas as contas de um usuário
   */
  async findByUser(user: AuthenticatedUser, storeId?: string): Promise<AdAccount[]> {
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
  async findAllUnsafeInternal(): Promise<AdAccount[]> {
    return this.adAccountRepository.find();
  }

  /**
   * Atualiza dados da conta (com validação de ownership)
   */
  async update(id: string, user: AuthenticatedUser, dto: UpdateAdAccountDto): Promise<AdAccount> {
    const adAccount = await this.findOne(id, user);
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
  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const adAccount = await this.findOne(id, user);
    adAccount.active = false;
    await this.adAccountRepository.save(adAccount);
  }

  /**
   * Busca conta por Meta ID (com validação de ownership)
   */
  async findByMetaId(metaId: string, user: AuthenticatedUser): Promise<AdAccount | null> {
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
