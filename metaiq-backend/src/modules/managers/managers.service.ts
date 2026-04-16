import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { Tenant } from '../tenants/tenant.entity';
import { Manager } from './manager.entity';
import { CreateManagerDto, UpdateManagerDto } from './dto/manager.dto';

@Injectable()
export class ManagersService {
  constructor(
    @InjectRepository(Manager)
    private readonly managerRepository: Repository<Manager>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async create(dto: CreateManagerDto): Promise<Manager> {
    await this.ensureNameAvailable(dto.name);

    const manager = this.managerRepository.create({
      name: dto.name.trim(),
      active: true,
    });

    const saved = await this.managerRepository.save(manager);
    await this.tenantRepository.save(
      this.tenantRepository.create({
        id: saved.id,
        name: saved.name,
      }),
    );
    return saved;
  }

  async findAllForUser(requester: AuthenticatedUser): Promise<Manager[]> {
    if (![Role.PLATFORM_ADMIN, Role.ADMIN].includes(requester.role)) {
      throw new ForbiddenException('Apenas ADMIN pode listar managers');
    }

    return this.findAllUnsafeInternal();
  }

  async findAllUnsafeInternal(): Promise<Manager[]> {
    return this.managerRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Manager> {
    const manager = await this.managerRepository.findOne({ where: { id } });
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
      const tenant = await this.tenantRepository.findOne({ where: { id } });
      if (tenant) {
        tenant.name = manager.name;
        await this.tenantRepository.save(tenant);
      }
    }

    if (dto.active !== undefined) {
      manager.active = dto.active;
    }

    return this.managerRepository.save(manager);
  }

  async toggleActive(id: string): Promise<Manager> {
    const manager = await this.findOne(id);
    manager.active = !manager.active;
    return this.managerRepository.save(manager);
  }

  private async ensureNameAvailable(name: string, ignoreId?: string): Promise<void> {
    const normalizedName = name.trim();
    const existing = await this.managerRepository.findOne({
      where: { name: normalizedName },
    });

    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Manager já cadastrado com este nome');
    }
  }
}
