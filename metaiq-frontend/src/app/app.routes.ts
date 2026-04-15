import { Routes } from '@angular/router';
import { AuthComponent } from './features/auth/auth.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { CampaignsComponent } from './features/campaigns/campaigns.component';
import { ManagersComponent } from './features/managers/managers.component';
import { StoresComponent } from './features/stores/stores.component';
import { UsersComponent } from './features/users/users.component';
import { authGuard } from './core/guards/auth.guard';
import { Role } from './core/models';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'auth', component: AuthComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  {
    path: 'campaigns',
    component: CampaignsComponent,
    canActivate: [authGuard],
    data: { roles: [Role.ADMIN, Role.MANAGER, Role.OPERATIONAL] },
  },
  {
    path: 'admin/managers',
    component: ManagersComponent,
    canActivate: [authGuard],
    data: { roles: [Role.ADMIN] },
  },
  {
    path: 'manager/stores',
    component: StoresComponent,
    canActivate: [authGuard],
    data: { roles: [Role.ADMIN, Role.MANAGER] },
  },
  {
    path: 'manager/users',
    component: UsersComponent,
    canActivate: [authGuard],
    data: { roles: [Role.ADMIN, Role.MANAGER] },
  },
  { path: '**', redirectTo: '/dashboard' }
];
