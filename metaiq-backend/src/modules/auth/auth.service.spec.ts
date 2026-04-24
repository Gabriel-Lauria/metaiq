import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AccountType, Role } from '../../common/enums';
import { AuditService } from '../../common/services/audit.service';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { UserStore } from '../user-stores/user-store.entity';
import { Manager } from '../managers/manager.entity';
import { Store } from '../stores/store.entity';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(async () => 'hashed-password'),
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let tenantRepository: jest.Mocked<Repository<Tenant>>;
  let userStoreRepository: jest.Mocked<Repository<UserStore>>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: ConfigService;
  let auditService: jest.Mocked<AuditService>;
  let dataSource: jest.Mocked<DataSource>;
  let transactionManager: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    tenantRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Tenant>>;

    userStoreRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserStore>>;

    transactionManager = {
      create: jest.fn((_entity, payload) => ({ ...payload })),
      findOne: jest.fn(),
      save: jest.fn(async (entity, payload) => {
        if (entity === Tenant) {
          return { id: 'tenant-1', ...payload };
        }
        if (entity === Manager) {
          return { id: 'manager-1', ...payload };
        }
        if (entity === User) {
          return { id: 'user-1', sessionVersion: 0, ...payload };
        }
        if (entity === Store) {
          return { id: 'store-1', ...payload };
        }
        if (entity === UserStore) {
          return { id: 'user-store-1', ...payload };
        }
        return payload;
      }),
    };

    dataSource = {
      transaction: jest.fn(async (callback) => callback(transactionManager as any)),
    } as unknown as jest.Mocked<DataSource>;

    jwtService = {
      sign: jest.fn()
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token'),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.secret') return 'jwt-secret';
        if (key === 'jwt.expiresIn') return '15m';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        if (key === 'jwt.refreshSecret') return 'refresh-secret';
        if (key === 'app.enablePublicRegister') return true;
        return undefined;
      }),
    } as unknown as ConfigService;

    auditService = {
      record: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    service = new AuthService(
      userRepository,
      tenantRepository,
      userStoreRepository,
      dataSource,
      jwtService,
      configService,
      auditService,
    );
  });

  it('returns accountType and storeId from tenant context on login', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    userRepository.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'owner@empresa.com',
      name: 'Owner',
      password: 'hashed-password',
      role: Role.ADMIN,
      managerId: 'manager-1',
      tenantId: 'tenant-1',
      active: true,
      sessionVersion: 0,
    } as User);
    tenantRepository.findOne.mockResolvedValueOnce({
      id: 'tenant-1',
      accountType: AccountType.INDIVIDUAL,
    } as Tenant);
    userStoreRepository.findOne.mockResolvedValueOnce({
      id: 'user-store-1',
      userId: 'user-1',
      storeId: 'store-1',
    } as UserStore);

    const result = await service.login('owner@empresa.com', 'secret123');

    expect(result.user.accountType).toBe(AccountType.INDIVIDUAL);
    expect(result.user.storeId).toBe('store-1');
    expect(result.user.tenantId).toBe('tenant-1');
  });

  it('creates tenant, internal manager, store, user and user_store for INDIVIDUAL register', async () => {
    transactionManager.findOne.mockResolvedValueOnce(null);
    userRepository.update.mockResolvedValueOnce({ affected: 1, generatedMaps: [], raw: [] } as any);

    const result = await service.register({
      email: ' owner@empresa.com ',
      password: 'secret123',
      name: 'Owner',
      accountType: AccountType.INDIVIDUAL,
      businessName: 'Clínica Sorriso',
      businessSegment: 'Odontologia',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://clinicasorriso.com.br',
      instagram: 'clinicasorriso',
      whatsapp: '(41) 99999-9999',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(transactionManager.save).toHaveBeenCalledWith(Tenant, expect.objectContaining({
      name: 'Clínica Sorriso',
      accountType: AccountType.INDIVIDUAL,
      businessName: 'Clínica Sorriso',
      businessSegment: 'Odontologia',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://clinicasorriso.com.br',
      instagram: '@clinicasorriso',
      whatsapp: '(41) 99999-9999',
    }));
    expect(transactionManager.save).toHaveBeenCalledWith(Manager, expect.objectContaining({
      name: 'Clínica Sorriso',
      contactName: 'Owner',
    }));
    expect(transactionManager.save).toHaveBeenCalledWith(Store, expect.objectContaining({
      name: 'Clínica Sorriso',
      tenantId: 'tenant-1',
      managerId: 'manager-1',
      createdByUserId: 'user-1',
    }));
    expect(transactionManager.save).toHaveBeenCalledWith(UserStore, expect.objectContaining({
      userId: 'user-1',
      storeId: 'store-1',
    }));
    expect(result.user.role).toBe(Role.ADMIN);
    expect(result.user.accountType).toBe(AccountType.INDIVIDUAL);
    expect(result.user.storeId).toBe('store-1');
    expect(result.user.tenantId).toBe('tenant-1');
  });

  it('rolls back registration when bootstrap fails in the middle', async () => {
    transactionManager.findOne.mockResolvedValueOnce(null);
    transactionManager.save.mockImplementation(async (entity, payload) => {
      if (entity === Tenant) return { id: 'tenant-1', ...payload };
      if (entity === Manager) return { id: 'manager-1', ...payload };
      if (entity === User) return { id: 'user-1', sessionVersion: 0, ...payload };
      if (entity === Store) {
        throw new Error('store bootstrap failed');
      }
      return payload;
    });

    await expect(service.register({
      email: 'owner@empresa.com',
      password: 'secret123',
      name: 'Owner',
      accountType: AccountType.INDIVIDUAL,
      businessName: 'Clínica Sorriso',
    })).rejects.toThrow('store bootstrap failed');

    expect(userRepository.update).not.toHaveBeenCalled();
    expect(transactionManager.save).not.toHaveBeenCalledWith(UserStore, expect.anything());
  });

  it('rejects AGENCY creation through public register', async () => {
    await expect(service.register({
      email: 'owner@empresa.com',
      password: 'secret123',
      name: 'Owner',
      accountType: AccountType.AGENCY,
      businessName: 'Empresa X',
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns company profile fields in the auth response after public register', async () => {
    transactionManager.findOne.mockResolvedValueOnce(null);
    userRepository.update.mockResolvedValueOnce({ affected: 1, generatedMaps: [], raw: [] } as any);
    tenantRepository.findOne.mockResolvedValueOnce({
      id: 'tenant-1',
      accountType: AccountType.INDIVIDUAL,
      businessName: 'Empresa Beta',
      businessSegment: 'Consultoria',
      defaultCity: 'São Paulo',
      defaultState: 'SP',
      website: 'https://empresabeta.com.br',
      instagram: '@empresabeta',
      whatsapp: '(11) 98888-7777',
    } as Tenant);

    const result = await service.register({
      email: 'beta@empresa.com',
      password: 'secret123',
      name: 'Beta User',
      accountType: AccountType.INDIVIDUAL,
      businessName: 'Empresa Beta',
      businessSegment: 'Consultoria',
      defaultCity: 'São Paulo',
      defaultState: 'sp',
      website: 'https://empresabeta.com.br',
      instagram: '@empresabeta',
      whatsapp: '(11) 98888-7777',
    });

    expect(result.user.accountType).toBe(AccountType.INDIVIDUAL);
    expect(result.user.storeId).toBe('store-1');
    expect(result.user.businessName).toBe('Empresa Beta');
    expect(result.user.businessSegment).toBe('Consultoria');
    expect(result.user.defaultCity).toBe('São Paulo');
    expect(result.user.defaultState).toBe('SP');
    expect(result.user.website).toBe('https://empresabeta.com.br');
    expect(result.user.instagram).toBe('@empresabeta');
    expect(result.user.whatsapp).toBe('(11) 98888-7777');
  });

  it('falls back to invalid credentials when password does not match', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
    userRepository.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'owner@empresa.com',
      name: 'Owner',
      password: 'hashed-password',
      role: Role.ADMIN,
      tenantId: 'tenant-1',
      active: true,
      sessionVersion: 0,
    } as User);

    await expect(service.login('owner@empresa.com', 'wrong-pass')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
