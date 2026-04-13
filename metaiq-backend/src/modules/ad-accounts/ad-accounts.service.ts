import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdAccount } from './ad-account.entity';

export interface CreateAdAccountDto {
  metaId: string;
  name: string;
  currency: string;
  userId: string;
}

export interface UpdateAdAccountDto {
  name?: string;
  active?: boolean;
}

@Injectable()
export class AdAccountsService {
  constructor(
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
  ) {}

  /**
   * Cria uma nova conta de anúncios
   */
  async create(dto: CreateAdAccountDto): Promise<AdAccount> {
    const adAccount = this.adAccountRepository.create(dto);
    return this.adAccountRepository.save(adAccount);
  }

  /**
   * Busca conta por ID
   */
  async findOne(id: string): Promise<AdAccount> {
    const adAccount = await this.adAccountRepository.findOne({ where: { id } });
    if (!adAccount) {
      throw new NotFoundException(`Conta de anúncios ${id} não encontrada`);
    }
    return adAccount;
  }

  /**
   * Lista todas as contas de um usuário
   */
  async findByUser(userId: string): Promise<AdAccount[]> {
    return this.adAccountRepository.find({ where: { userId } });
  }

  /**
   * Lista todas as contas
   */
  async findAll(): Promise<AdAccount[]> {
    return this.adAccountRepository.find();
  }

  /**
   * Atualiza dados da conta
   */
  async update(id: string, dto: UpdateAdAccountDto): Promise<AdAccount> {
    const adAccount = await this.findOne(id);
    Object.assign(adAccount, dto);
    return this.adAccountRepository.save(adAccount);
  }

  /**
   * Delete (soft delete — desativa)
   */
  async remove(id: string): Promise<void> {
    const adAccount = await this.findOne(id);
    adAccount.active = false;
    await this.adAccountRepository.save(adAccount);
  }

  /**
   * Busca conta por Meta ID
   */
  async findByMetaId(metaId: string): Promise<AdAccount | null> {
    return this.adAccountRepository.findOne({ where: { metaId } });
  }
}
