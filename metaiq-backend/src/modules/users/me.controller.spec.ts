import { ForbiddenException } from '@nestjs/common';
import { AccountType, Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AuditService } from '../../common/services/audit.service';
import { UpdateMyCompanyDto } from './company-profile.dto';
import { MeController } from './me.controller';
import { CompanyProfileResponseView, UsersService } from './users.service';

describe('MeController', () => {
  const individualUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@test.com',
    role: Role.ADMIN,
    tenantId: 'tenant-1',
    managerId: 'manager-1',
    accountType: AccountType.INDIVIDUAL,
  };

  let usersService: jest.Mocked<Pick<UsersService, 'getMyCompanyForUser' | 'updateMyCompanyForUser'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let controller: MeController;

  beforeEach(() => {
    usersService = {
      getMyCompanyForUser: jest.fn(),
      updateMyCompanyForUser: jest.fn(),
    };
    auditService = {
      record: jest.fn(),
    };

    controller = new MeController(usersService as unknown as UsersService, auditService as unknown as AuditService);
  });

  it('returns the company profile for an individual user', async () => {
    const profile: CompanyProfileResponseView = {
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    };
    usersService.getMyCompanyForUser.mockResolvedValue(profile);

    await expect(controller.getMyCompany({ user: individualUser })).resolves.toEqual(profile);
    expect(usersService.getMyCompanyForUser).toHaveBeenCalledWith(individualUser);
  });

  it('updates only allowed company fields', async () => {
    const dto: UpdateMyCompanyDto = {
      businessName: 'Pet Feliz',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
    };
    const updated: CompanyProfileResponseView = {
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    };
    usersService.updateMyCompanyForUser.mockResolvedValue(updated);

    await expect(controller.updateMyCompany({ user: individualUser, requestId: 'req-1' }, dto)).resolves.toEqual(updated);
    expect(usersService.updateMyCompanyForUser).toHaveBeenCalledWith(individualUser, dto);
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'company.self_update',
      targetId: 'tenant-1',
      metadata: { changedFields: ['businessName', 'website', 'instagram'] },
    }));
  });

  it('propagates forbidden access for agency accounts', async () => {
    usersService.getMyCompanyForUser.mockRejectedValue(
      new ForbiddenException('Este endpoint está disponível apenas para contas INDIVIDUAL'),
    );

    await expect(controller.getMyCompany({
      user: { ...individualUser, accountType: AccountType.AGENCY },
    })).rejects.toThrow(ForbiddenException);
  });
});
