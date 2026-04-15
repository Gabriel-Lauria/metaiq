import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Manager } from './manager.entity';
import { CreateManagerDto, UpdateManagerDto } from './dto/manager.dto';

@Injectable()
export class ManagersService {
  constructor(
    @InjectRepository(Manager)
    private readonly managerRepository: Repository<Manager>,
  ) {}

  async create(dto: CreateManagerDto): Promise<Manager> {
    await this.ensureNameAvailable(dto.name);

    const manager = this.managerRepository.create({
      name: dto.name.trim(),
      active: true,
    });

    return this.managerRepository.save(manager);
  }

  async findAll(): Promise<Manager[]> {
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
