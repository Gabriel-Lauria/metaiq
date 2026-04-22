import { routes } from './app.routes';
import { Role } from './core/models';

describe('app routes authorization', () => {
  it('restricts the global managers route to platform admins', () => {
    const managersRoute = routes.find((route) => route.path === 'admin/managers');

    expect(managersRoute).toBeTruthy();
    expect(managersRoute?.data?.['roles']).toEqual([Role.PLATFORM_ADMIN]);
    expect(managersRoute?.data?.['roles']).not.toContain(Role.ADMIN);
  });
});
