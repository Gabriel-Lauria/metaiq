import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AdAccount } from './ad-account.entity';
import { CreateAdAccountDto, UpdateAdAccountDto } from './dto/ad-account.dto';

@Injectable()
export class AdAccountsService {
  constructor(
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    private readonly accessScope: AccessScopeService,
  ) {}

  async create(
    dto: CreateAdAccountDto & { userId: string; storeId?: string | null },
    user: AuthenticatedUser,
  ): Promise<AdAccount> {
    await this.accessScope.assertCanAccessStore(user, dto.storeId);
    const adAccount = this.adAccountRepository.create(dto);
    const saved = await this.adAccountRepository.save(adAccount);
    delete (saved as Partial<AdAccount>).accessToken;
    return saved;
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<AdAccount> {
    if (!user.id) {
      throw new ForbiddenException('Usuario autenticado invalido');
    }

    const adAccount = await this.accessScope
      .applyAdAccountScope(
        this.adAccountRepository
          .createQueryBuilder('adAccount')
          .leftJoinAndSelect('adAccount.store', 'store')
          .where('adAccount.id = :id', { id }),
        user,
      )
      .getOne();

    if (!adAccount) {
      throw new NotFoundException(`Conta de anuncios ${id} nao encontrada`);
    }

    return adAccount;
  }

  async findByUser(user: AuthenticatedUser): Promise<AdAccount[]> {
    if (!user.id) {
      throw new ForbiddenException('Usuario autenticado invalido');
    }

    return this.accessScope
      .applyAdAccountScope(
        this.adAccountRepository
          .createQueryBuilder('adAccount')
          .leftJoinAndSelect('adAccount.store', 'store')
          .orderBy('adAccount.createdAt', 'DESC'),
        user,
      )
      .getMany();
  }

  async findAll(): Promise<AdAccount[]> {
    return this.adAccountRepository.find();
  }

  async update(id: string, user: AuthenticatedUser, dto: UpdateAdAccountDto): Promise<AdAccount> {
    const adAccount = await this.findOne(id, user);
    await this.accessScope.assertCanAccessStore(user, dto.storeId ?? adAccount.storeId);
    Object.assign(adAccount, dto);
    return this.adAccountRepository.save(adAccount);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const adAccount = await this.findOne(id, user);
    adAccount.active = false;
    await this.adAccountRepository.save(adAccount);
  }

  async findByMetaId(metaId: string, user: AuthenticatedUser): Promise<AdAccount | null> {
    if (!user.id) {
      throw new ForbiddenException('Usuario autenticado invalido');
    }

    return this.accessScope
      .applyAdAccountScope(
        this.adAccountRepository
          .createQueryBuilder('adAccount')
          .leftJoinAndSelect('adAccount.store', 'store')
          .where('adAccount.metaId = :metaId', { metaId }),
        user,
      )
      .getOne();
  }
}
