import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { Role } from './core/models';

const ALL_AUTHENTICATED_ROLES = [
  Role.PLATFORM_ADMIN,
  Role.ADMIN,
  Role.MANAGER,
  Role.OPERATIONAL,
  Role.CLIENT,
];

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full', data: { roles: [] } },
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent),
    data: { roles: [] },
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/metrics/metrics.component').then((m) => m.MetricsComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: ALL_AUTHENTICATED_ROLES },
  },
  {
    path: 'campaigns',
    loadComponent: () => import('./features/campaigns/campaigns.component').then((m) => m.CampaignsComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: ALL_AUTHENTICATED_ROLES },
  },
  {
    path: 'metrics',
    loadComponent: () => import('./features/metrics/metrics.component').then((m) => m.MetricsComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: ALL_AUTHENTICATED_ROLES },
  },
  {
    path: 'insights',
    loadComponent: () => import('./features/insights/insights.component').then((m) => m.InsightsComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: ALL_AUTHENTICATED_ROLES },
  },
  {
    path: 'results',
    loadComponent: () => import('./features/results/results.component').then((m) => m.ResultsComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.CLIENT] },
  },
  {
    path: 'admin/managers',
    loadComponent: () => import('./features/managers/managers.component').then((m) => m.ManagersComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.PLATFORM_ADMIN] },
  },
  {
    path: 'manager/stores',
    loadComponent: () => import('./features/stores/stores.component').then((m) => m.StoresComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER] },
  },
  {
    path: 'manager/users',
    loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER] },
  },
  {
    path: 'manager/integrations',
    loadComponent: () => import('./features/integrations/integrations.component').then((m) => m.IntegrationsComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL] },
  },
  { path: '**', redirectTo: '/dashboard', data: { roles: [] } },
];
