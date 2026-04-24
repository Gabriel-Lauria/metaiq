import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountType, Role } from '../../common/enums';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { Tenant } from '../tenants/tenant.entity';
import { User } from './user.entity';
import { UsersService } from './users.service';

describe('UsersService my-company', () => {
  const individualUser = {
    id: 'user-1',
    email: 'owner@test.com',
    role: Role.ADMIN,
    tenantId: 'tenant-1',
    managerId: 'manager-1',
    accountType: AccountType.INDIVIDUAL,
  };

  let service: UsersService;
  let tenantRepository: jest.Mocked<Pick<Repository<Tenant>, 'findOne' | 'save'>>;
  let accessScope: jest.Mocked<Pick<AccessScopeService, 'validateTenantAccess'>>;

  beforeEach(() => {
    tenantRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    accessScope = {
      validateTenantAccess: jest.fn(),
    };

    service = new UsersService(
      {} as Repository<User>,
      {} as any,
      tenantRepository as unknown as Repository<Tenant>,
      {} as any,
      accessScope as unknown as AccessScopeService,
    );
  });

  it('returns the current tenant company profile for individual users', async () => {
    tenantRepository.findOne.mockResolvedValue({
      id: 'tenant-1',
      active: true,
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    } as Tenant);

    await expect(service.getMyCompanyForUser(individualUser)).resolves.toEqual({
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    });
    expect(accessScope.validateTenantAccess).toHaveBeenCalledWith(individualUser, 'tenant-1');
  });

  it('updates only the allowed company fields', async () => {
    const tenant = {
      id: 'tenant-1',
      active: true,
      name: 'Nome antigo',
      businessName: 'Nome antigo',
      businessSegment: null,
      defaultCity: null,
      defaultState: null,
      website: null,
      instagram: null,
      whatsapp: null,
    } as Tenant;

    tenantRepository.findOne.mockResolvedValue(tenant);
    tenantRepository.save.mockImplementation(async (entity) => entity as Tenant);

    await expect(service.updateMyCompanyForUser(individualUser, {
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'pr',
      website: 'https://petfeliz.com.br',
      instagram: 'petfeliz',
      whatsapp: '(41) 99999-9999',
    })).resolves.toEqual({
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    });

    expect(tenantRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Pet Feliz',
      businessName: 'Pet Feliz',
      defaultState: 'PR',
      instagram: '@petfeliz',
    }));
  });

  it('forbids agency accounts from accessing the endpoint', async () => {
    await expect(service.getMyCompanyForUser({
      ...individualUser,
      accountType: AccountType.AGENCY,
    })).rejects.toThrow(ForbiddenException);
  });
});
