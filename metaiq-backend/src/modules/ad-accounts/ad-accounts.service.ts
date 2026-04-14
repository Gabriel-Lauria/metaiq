import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdAccount } from './ad-account.entity';
import { CreateAdAccountDto, UpdateAdAccountDto } from './dto/ad-account.dto';

@Injectable()
export class AdAccountsService {
  constructor(
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
  ) {}

  /**
   * Cria uma nova conta de anúncios
   */
  async create(dto: CreateAdAccountDto & { userId: string }): Promise<AdAccount> {
    const adAccount = this.adAccountRepository.create(dto);
    const saved = await this.adAccountRepository.save(adAccount);
    delete (saved as Partial<AdAccount>).accessToken;
    return saved;
  }

  /**
   * Busca conta por ID com validação de ownership
   */
  async findOne(id: string, userId: string): Promise<AdAccount> {
    if (!userId) {
      throw new ForbiddenException('Usuário autenticado inválido');
    }

    const adAccount = await this.adAccountRepository.findOne({
      where: { id, userId },
    });
    if (!adAccount) {
      throw new NotFoundException(`Conta de anúncios ${id} não encontrada`);
    }

    return adAccount;
  }

  /**
   * Lista todas as contas de um usuário
   */
  async findByUser(userId: string): Promise<AdAccount[]> {
    if (!userId) {
      throw new ForbiddenException('Usuário autenticado inválido');
    }

    return this.adAccountRepository.find({ where: { userId } });
  }

  /**
   * Lista todas as contas
   */
  async findAll(): Promise<AdAccount[]> {
    return this.adAccountRepository.find();
  }

  /**
   * Atualiza dados da conta (com validação de ownership)
   */
  async update(id: string, userId: string, dto: UpdateAdAccountDto): Promise<AdAccount> {
    const adAccount = await this.findOne(id, userId);
    Object.assign(adAccount, dto);
    return this.adAccountRepository.save(adAccount);
  }

  /**
   * Delete (soft delete — desativa) com validação de ownership
   */
  async remove(id: string, userId: string): Promise<void> {
    const adAccount = await this.findOne(id, userId);
    adAccount.active = false;
    await this.adAccountRepository.save(adAccount);
  }

  /**
   * Busca conta por Meta ID (com validação de ownership)
   */
  async findByMetaId(metaId: string, userId: string): Promise<AdAccount | null> {
    if (!userId) {
      throw new ForbiddenException('Usuário autenticado inválido');
    }

    return this.adAccountRepository.findOne({ where: { metaId, userId } });
  }
}
