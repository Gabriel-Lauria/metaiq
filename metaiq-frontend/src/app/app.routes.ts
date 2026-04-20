import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { Role } from './core/models';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'auth', loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent) },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/metrics/metrics.component').then((m) => m.MetricsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'campaigns',
    loadComponent: () => import('./features/campaigns/campaigns.component').then((m) => m.CampaignsComponent),
    canActivate: [authGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT] },
  },
  {
    path: 'metrics',
    loadComponent: () => import('./features/metrics/metrics.component').then((m) => m.MetricsComponent),
    canActivate: [authGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT] },
  },
  {
    path: 'insights',
    loadComponent: () => import('./features/insights/insights.component').then((m) => m.InsightsComponent),
    canActivate: [authGuard],
    data: { roles: [Role.OPERATIONAL] },
  },
  {
    path: 'results',
    loadComponent: () => import('./features/results/results.component').then((m) => m.ResultsComponent),
    canActivate: [authGuard],
    data: { roles: [Role.CLIENT] },
  },
  {
    path: 'admin/managers',
    loadComponent: () => import('./features/managers/managers.component').then((m) => m.ManagersComponent),
    canActivate: [authGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN] },
  },
  {
    path: 'manager/stores',
    loadComponent: () => import('./features/stores/stores.component').then((m) => m.StoresComponent),
    canActivate: [authGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER] },
  },
  {
    path: 'manager/users',
    loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent),
    canActivate: [authGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER] },
  },
  {
    path: 'manager/integrations',
    loadComponent: () => import('./features/integrations/integrations.component').then((m) => m.IntegrationsComponent),
    canActivate: [authGuard],
    data: { roles: [Role.PLATFORM_ADMIN, Role.OPERATIONAL] },
  },
  { path: '**', redirectTo: '/dashboard' },
];
