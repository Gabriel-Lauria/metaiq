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

  it('restricts the global managers route to platform admins', () => {
    const managersRoute = routes.find((route) => route.path === 'admin/managers');

    expect(managersRoute).toBeTruthy();
    expect(managersRoute?.data?.['roles']).toEqual([Role.PLATFORM_ADMIN]);
    expect(managersRoute?.data?.['roles']).not.toContain(Role.ADMIN);
  });

  it('allows all authenticated roles to read campaigns, metrics and insights', () => {
    for (const path of ['campaigns', 'metrics', 'insights']) {
      const route = routes.find((item) => item.path === path);

      expect(route).toBeTruthy();
      expect(route?.data?.['roles']).toEqual(allAuthenticatedRoles);
    }
  });

  it('allows admins and operational users to access Meta integrations without exposing it to managers or clients', () => {
    const integrationsRoute = routes.find((route) => route.path === 'manager/integrations');

    expect(integrationsRoute).toBeTruthy();
    expect(integrationsRoute?.data?.['roles']).toEqual([
      Role.PLATFORM_ADMIN,
      Role.ADMIN,
      Role.OPERATIONAL,
    ]);
    expect(integrationsRoute?.data?.['roles']).not.toContain(Role.MANAGER);
    expect(integrationsRoute?.data?.['roles']).not.toContain(Role.CLIENT);
  });
});
