import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { Tenant } from '../tenants/tenant.entity';
import { Manager } from './manager.entity';
import { CreateManagerDto, UpdateManagerDto } from './dto/manager.dto';
import { User } from '../users/user.entity';
import { Store } from '../stores/store.entity';
import { UserStore } from '../user-stores/user-store.entity';
import { StoreIntegration } from '../integrations/store-integration.entity';
import { AdAccount } from '../ad-accounts/ad-account.entity';
import { Campaign } from '../campaigns/campaign.entity';
import { MetricDaily } from '../metrics/metric-daily.entity';
import { Insight } from '../insights/insight.entity';

@Injectable()
export class ManagersService {
  constructor(
    @InjectRepository(Manager)
    private readonly managerRepository: Repository<Manager>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(UserStore)
    private readonly userStoreRepository: Repository<UserStore>,
    @InjectRepository(StoreIntegration)
    private readonly storeIntegrationRepository: Repository<StoreIntegration>,
    @InjectRepository(AdAccount)
    private readonly adAccountRepository: Repository<AdAccount>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(MetricDaily)
    private readonly metricDailyRepository: Repository<MetricDaily>,
    @InjectRepository(Insight)
    private readonly insightRepository: Repository<Insight>,
  ) {}

  async create(dto: CreateManagerDto): Promise<Manager> {
    await this.ensureNameAvailable(dto.name);

    const manager = this.managerRepository.create({
      name: dto.name.trim(),
      cnpj: this.cleanNullable(dto.cnpj),
      phone: this.cleanNullable(dto.phone),
      email: this.cleanNullable(dto.email),
      contactName: this.cleanNullable(dto.contactName),
      notes: this.cleanNullable(dto.notes),
      active: true,
    });

    const saved = await this.managerRepository.save(manager);
    await this.tenantRepository.save(
      this.tenantRepository.create({
        id: saved.id,
        name: saved.name,
        cnpj: saved.cnpj,
        phone: saved.phone,
        email: saved.email,
        contactName: saved.contactName,
        notes: saved.notes,
        active: saved.active,
      }),
    );
    return saved;
  }

  async findAllForUser(requester: AuthenticatedUser): Promise<Manager[]> {
    if (requester.role !== Role.PLATFORM_ADMIN) {
      throw new ForbiddenException('Apenas PLATFORM_ADMIN pode listar managers');
    }

    return this.findAllUnsafeInternal();
  }

  async findAllUnsafeInternal(): Promise<Manager[]> {
    return this.managerRepository.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Manager> {
    const manager = await this.managerRepository.findOne({ where: { id, deletedAt: IsNull() } });
    if (!manager) {
      throw new NotFoundException('Manager não encontrado');
    }

    return manager;
  }

  async update(id: string, dto: UpdateManagerDto): Promise<Manager> {
    const manager = await this.findOne(id);

    if (dto.name !== undefined) {
      await this.ensureNameAvailable(dto.name, id);
      manager.name = dto.name.trim();
    }

    if (dto.active !== undefined) {
      manager.active = dto.active;
    }

    this.applyCompanyFields(manager, dto);
    const saved = await this.managerRepository.save(manager);
    await this.syncTenantFromManager(saved);
    return saved;
  }

  async toggleActive(id: string): Promise<Manager> {
    const manager = await this.findOne(id);
    manager.active = !manager.active;
    const saved = await this.managerRepository.save(manager);
    await this.syncTenantFromManager(saved);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const manager = await this.findOne(id);
    const dependencies = await this.countCompanyDependencies(id);
    const totalDependencies = Object.values(dependencies).reduce((total, count) => total + count, 0);

    if (totalDependencies > 0) {
      throw new ConflictException(
        `Empresa possui dependências ativas e não pode ser excluída com segurança: ${this.formatDependencies(dependencies)}.`,
      );
    }

    const deletedAt = new Date();
    manager.active = false;
    manager.deletedAt = deletedAt;
    await this.managerRepository.save(manager);

    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (tenant) {
      tenant.active = false;
      tenant.deletedAt = deletedAt;
      await this.tenantRepository.save(tenant);
    }
  }

  private async ensureNameAvailable(name: string, ignoreId?: string): Promise<void> {
    const normalizedName = name.trim();
    const existing = await this.managerRepository.findOne({
      where: { name: normalizedName, deletedAt: IsNull() },
    });

    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Manager já cadastrado com este nome');
    }
  }

  private applyCompanyFields(manager: Manager, dto: UpdateManagerDto): void {
    if (dto.cnpj !== undefined) manager.cnpj = this.cleanNullable(dto.cnpj);
    if (dto.phone !== undefined) manager.phone = this.cleanNullable(dto.phone);
    if (dto.email !== undefined) manager.email = this.cleanNullable(dto.email);
    if (dto.contactName !== undefined) manager.contactName = this.cleanNullable(dto.contactName);
    if (dto.notes !== undefined) manager.notes = this.cleanNullable(dto.notes);
  }

  private async syncTenantFromManager(manager: Manager): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { id: manager.id } });
    if (!tenant) {
      return;
    }

    tenant.name = manager.name;
    tenant.active = manager.active;
    tenant.cnpj = manager.cnpj;
    tenant.phone = manager.phone;
    tenant.email = manager.email;
    tenant.contactName = manager.contactName;
    tenant.notes = manager.notes;
    tenant.deletedAt = manager.deletedAt;
    await this.tenantRepository.save(tenant);
  }

  private cleanNullable(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private async countCompanyDependencies(tenantId: string): Promise<Record<string, number>> {
    const storeIds = (await this.storeRepository.find({
      where: { tenantId, deletedAt: IsNull() },
      select: ['id'],
    })).map((store) => store.id);

    const users = await this.userRepository.count({ where: { tenantId, deletedAt: IsNull() } });
    const stores = storeIds.length;

    if (!storeIds.length) {
      return {
        users,
        stores,
        userStores: 0,
        storeIntegrations: 0,
        adAccounts: 0,
        campaigns: 0,
        metrics: 0,
        insights: 0,
      };
    }

    const [
      userStores,
      storeIntegrations,
      adAccounts,
      campaigns,
      metrics,
      insights,
    ] = await Promise.all([
      this.userStoreRepository
        .createQueryBuilder('userStore')
        .where('userStore.storeId IN (:...storeIds)', { storeIds })
        .getCount(),
      this.storeIntegrationRepository
        .createQueryBuilder('integration')
        .where('integration.storeId IN (:...storeIds)', { storeIds })
        .getCount(),
      this.adAccountRepository
        .createQueryBuilder('adAccount')
        .where('adAccount.storeId IN (:...storeIds)', { storeIds })
        .getCount(),
      this.campaignRepository
        .createQueryBuilder('campaign')
        .where('campaign.storeId IN (:...storeIds)', { storeIds })
        .getCount(),
      this.metricDailyRepository
        .createQueryBuilder('metric')
        .innerJoin('metric.campaign', 'campaign')
        .where('campaign.storeId IN (:...storeIds)', { storeIds })
        .getCount(),
      this.insightRepository
        .createQueryBuilder('insight')
        .innerJoin('insight.campaign', 'campaign')
        .where('campaign.storeId IN (:...storeIds)', { storeIds })
        .getCount(),
    ]);

    return {
      users,
      stores,
      userStores,
      storeIntegrations,
      adAccounts,
      campaigns,
      metrics,
      insights,
    };
  }

  private formatDependencies(dependencies: Record<string, number>): string {
    const labels: Record<string, string> = {
      users: 'usuário(s)',
      stores: 'loja(s)',
      userStores: 'vínculo(s) usuário-loja',
      storeIntegrations: 'integração(ões)',
      adAccounts: 'conta(s) de anúncio',
      campaigns: 'campanha(s)',
      metrics: 'métrica(s)',
      insights: 'insight(s)',
    };

    return Object.entries(dependencies)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${count} ${labels[key] ?? key}`)
      .join(', ');
  }
}
