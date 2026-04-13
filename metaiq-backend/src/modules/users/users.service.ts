import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

export interface UpdateUserDto {
  email?: string;
  name?: string;
  password?: string;
}

@Injectable()
export class UsersService {
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Cria um novo usuário com senha hasheada
   */
  async create(dto: CreateUserDto): Promise<User> {
    // Verifica se email já existe
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    const user = this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
    });

    return this.userRepository.save(user);
  }

  /**
   * Busca usuário por email (para login)
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  /**
   * Busca usuário por ID
   */
  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuário ${id} não encontrado`);
    }
    return user;
  }

  /**
   * Lista todos os usuários (apenas para admin)
   */
  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  /**
   * Atualiza dados do usuário
   */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Se tentando mudar email, verifica se não existe outro com esse email
    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email já em uso');
      }
      user.email = dto.email;
    }

    if (dto.name) {
      user.name = dto.name;
    }

    // Se forneceu nova senha, faz hash
    if (dto.password) {
      if (dto.password.length < 6) {
        throw new BadRequestException('Senha deve ter no mínimo 6 caracteres');
      }
      user.password = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);
    }

    return this.userRepository.save(user);
  }

  /**
   * Delete (soft delete — marca como inativo)
   */
  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    user.active = false;
    await this.userRepository.save(user);
  }

  /**
   * Valida credenciais (para login)
   */
  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
