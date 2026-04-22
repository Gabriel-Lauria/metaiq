import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums';
import { AccessScopeService } from '../services/access-scope.service';
import { OwnershipGuard } from './ownership.guard';

describe('OwnershipGuard', () => {
  function createContext(params: Record<string, string> = {}): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          params,
          path: '/api/not-used/by-ownership-guard',
          user: {
            id: 'user-1',
            email: 'user@test.com',
            role: Role.MANAGER,
            tenantId: 'tenant-1',
          },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('uses explicit decorator metadata and a custom param name instead of parsing the URL', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        resource: 'metricCampaign',
        paramName: 'campaignId',
      }),
    } as unknown as Reflector;
    const accessScope = {
      canAccessResource: jest.fn().mockResolvedValue(true),
    } as unknown as AccessScopeService;
    const guard = new OwnershipGuard(reflector, accessScope);

    await expect(
      guard.canActivate(
        createContext({
          campaignId: '00000000-0000-4000-8000-000000000001',
          id: '00000000-0000-4000-8000-000000000099',
        }),
      ),
    ).resolves.toBe(true);

    expect(accessScope.canAccessResource).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      'metricCampaign',
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('fails closed when OwnershipGuard is used without CheckOwnership metadata', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const accessScope = {
      canAccessResource: jest.fn(),
    } as unknown as AccessScopeService;
    const guard = new OwnershipGuard(reflector, accessScope);

    await expect(
      guard.canActivate(createContext({ id: '00000000-0000-4000-8000-000000000001' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accessScope.canAccessResource).not.toHaveBeenCalled();
  });

  it('returns the project standard not found response when resource is outside scope', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        resource: 'campaign',
        paramName: 'id',
      }),
    } as unknown as Reflector;
    const accessScope = {
      canAccessResource: jest.fn().mockResolvedValue(false),
    } as unknown as AccessScopeService;
    const guard = new OwnershipGuard(reflector, accessScope);

    await expect(
      guard.canActivate(createContext({ id: '00000000-0000-4000-8000-000000000002' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects malformed resource IDs before querying ownership', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        resource: 'campaign',
        paramName: 'id',
      }),
    } as unknown as Reflector;
    const accessScope = {
      canAccessResource: jest.fn(),
    } as unknown as AccessScopeService;
    const guard = new OwnershipGuard(reflector, accessScope);

    await expect(guard.canActivate(createContext({ id: 'not-a-uuid' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(accessScope.canAccessResource).not.toHaveBeenCalled();
  });
});
