import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AccountType, Role } from '../../common/enums';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    get: jest.fn((key: string) => (key === 'jwt.secret' ? 'test-jwt-secret' : undefined)),
  } as unknown as ConfigService;

  const userRepository = {
    findOne: jest.fn(),
  } as unknown as Repository<User>;

  const tenantRepository = {
    findOne: jest.fn(),
  } as unknown as Repository<Tenant>;

  const strategy = new JwtStrategy(userRepository, tenantRepository, configService);

  beforeEach(() => {
    jest.clearAllMocks();
    (tenantRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'tenant-1',
      accountType: AccountType.AGENCY,
    });
  });

  it('accepts a token when the sessionVersion matches the database', async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      role: Role.ADMIN,
      managerId: 'manager-1',
      tenantId: 'tenant-1',
      active: true,
      sessionVersion: 2,
    } satisfies Partial<User>);

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'user@test.com',
        role: Role.ADMIN,
        sessionVersion: 2,
      }),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'user@test.com',
      role: Role.ADMIN,
      managerId: 'manager-1',
      tenantId: 'tenant-1',
      accountType: AccountType.AGENCY,
    });
  });

  it('rejects a token when the sessionVersion is stale', async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      role: Role.ADMIN,
      active: true,
      sessionVersion: 3,
    } satisfies Partial<User>);

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'user@test.com',
        role: Role.ADMIN,
        sessionVersion: 2,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
