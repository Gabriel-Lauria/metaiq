import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { accountTypeGuard } from './core/guards/account-type.guard';
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
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.component').then((m) => m.LandingComponent),
    pathMatch: 'full',
    data: { roles: [] },
  },
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent),
    data: { roles: [] },
  },
  {
    path: 'register',
    loadComponent: () => import('./features/register/register.component').then((m) => m.RegisterComponent),
    data: { roles: [] },
  },
  {
    path: 'welcome',
    loadComponent: () => import('./features/welcome/welcome.component').then((m) => m.WelcomeComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: ALL_AUTHENTICATED_ROLES },
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
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
    canActivate: [authGuard, accountTypeGuard, roleGuard],
    data: { roles: [Role.PLATFORM_ADMIN], disallowedAccountTypes: ['INDIVIDUAL'], accountTypeRedirectTo: '/dashboard' },
  },
  {
    path: 'manager/stores',
    loadComponent: () => import('./features/stores/stores.component').then((m) => m.StoresComponent),
    canActivate: [authGuard, accountTypeGuard, roleGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER], disallowedAccountTypes: ['INDIVIDUAL'], accountTypeRedirectTo: '/dashboard' },
  },
  {
    path: 'manager/users',
    loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent),
    canActivate: [authGuard, accountTypeGuard, roleGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER], disallowedAccountTypes: ['INDIVIDUAL'], accountTypeRedirectTo: '/dashboard' },
  },
  {
    path: 'manager/integrations',
    loadComponent: () => import('./features/integrations/integrations.component').then((m) => m.IntegrationsComponent),
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL] },
  },
  {
    path: 'my-company',
    loadComponent: () => import('./features/my-company/my-company.component').then((m) => m.MyCompanyComponent),
    canActivate: [authGuard, accountTypeGuard, roleGuard],
    data: { roles: ALL_AUTHENTICATED_ROLES, allowedAccountTypes: ['INDIVIDUAL'], accountTypeRedirectTo: '/dashboard' },
  },
  { path: '**', redirectTo: '/', data: { roles: [] } },
];
