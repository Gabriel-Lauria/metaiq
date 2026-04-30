import { routes } from './app.routes';
import { Role } from './core/models';

describe('app routes authorization', () => {
  const allAuthenticatedRoles = [
    Role.PLATFORM_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.OPERATIONAL,
    Role.CLIENT,
  ];

  it('defines roles data for every route', () => {
    for (const route of routes) {
      expect(route.data?.['roles']).toBeDefined();
    }
  });

  it('exposes public landing and register routes without authenticated roles', () => {
    const landingRoute = routes.find((route) => route.path === '');
    const registerRoute = routes.find((route) => route.path === 'register');

    expect(landingRoute?.data?.['roles']).toEqual([]);
    expect(registerRoute?.data?.['roles']).toEqual([]);
  });

  it('restricts the global managers route to platform admins', () => {
    const managersRoute = routes.find((route) => route.path === 'admin/managers');

    expect(managersRoute).toBeTruthy();
    expect(managersRoute?.data?.['roles']).toEqual([Role.PLATFORM_ADMIN]);
    expect(managersRoute?.data?.['roles']).not.toContain(Role.ADMIN);
    expect(managersRoute?.data?.['disallowedAccountTypes']).toEqual(['INDIVIDUAL']);
  });

  it('allows all authenticated roles to read campaigns, metrics and insights', () => {
    for (const path of ['welcome', 'campaigns', 'metrics', 'insights']) {
      const route = routes.find((item) => item.path === path);

      expect(route).toBeTruthy();
      expect(route?.data?.['roles']).toEqual(allAuthenticatedRoles);
    }
  });

  it('allows manager access to Meta integrations without exposing it to clients', () => {
    const integrationsRoute = routes.find((route) => route.path === 'manager/integrations');

    expect(integrationsRoute).toBeTruthy();
    expect(integrationsRoute?.data?.['roles']).toEqual([
      Role.PLATFORM_ADMIN,
      Role.ADMIN,
      Role.MANAGER,
      Role.OPERATIONAL,
    ]);
    expect(integrationsRoute?.data?.['roles']).not.toContain(Role.CLIENT);
  });

  it('exposes my-company only for individual accounts', () => {
    const companyRoute = routes.find((route) => route.path === 'my-company');

    expect(companyRoute).toBeTruthy();
    expect(companyRoute?.data?.['allowedAccountTypes']).toEqual(['INDIVIDUAL']);
    expect(companyRoute?.data?.['roles']).toEqual(allAuthenticatedRoles);
  });
});
