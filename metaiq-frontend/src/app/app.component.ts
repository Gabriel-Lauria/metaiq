import { Component, effect, inject, signal } from '@angular/core';
import { AsyncPipe, DatePipe, NgIf } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NotificationContainerComponent } from './core/components/notification-container.component';
import { GlobalLoadingComponent } from './core/components/global-loading.component';
import { Role } from './core/models';
import { roleLabel } from './core/role-labels';
import { AuthService } from './core/services/auth.service';
import { UiService } from './core/services/ui.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    AsyncPipe,
    DatePipe,
    NgIf,
    RouterLink,
    RouterOutlet,
    NotificationContainerComponent,
    GlobalLoadingComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  private authService = inject(AuthService);
  private uiService = inject(UiService);
  private router = inject(Router);

  isAuthenticated$ = this.authService.isAuthenticated$;
  currentUser$ = this.authService.currentUser$;
  currentRole$ = this.authService.currentRole$;
  currentTitle = 'Dashboard';
  today = new Date();
  sidebarOpen = signal(this.getSavedSidebarState());
  sidebarOverlayOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updatePageTitle();
        if (this.isSmallScreen()) {
          this.sidebarOpen.set(false);
          this.sidebarOverlayOpen.set(false);
        }
      });

    effect(() => {
      const state = this.sidebarOpen();
      if (!this.isSmallScreen()) {
        localStorage.setItem('sidebar-state', state ? 'open' : 'collapsed');
      }
    });
  }

  private getSavedSidebarState(): boolean {
    try {
      const saved = localStorage.getItem('sidebar-state');
      return saved !== 'collapsed';
    } catch {
      return true;
    }
  }

  private updatePageTitle(): void {
    const url = this.router.url;
    const role = this.authService.getCurrentRole();
    const titles: { [key: string]: string } = {
      '/dashboard': role === Role.CLIENT
        ? 'Resultados da Loja'
        : role === Role.MANAGER
          ? 'Central do Supervisor'
          : [Role.PLATFORM_ADMIN, Role.ADMIN].includes(role as Role)
            ? 'Administração da Empresa'
            : 'Operação da Loja',
      '/campaigns': 'Campanhas',
      '/metrics': 'Métricas',
      '/insights': 'Insights',
      '/results': 'Resultados',
      '/admin/managers': 'Empresas',
      '/manager/stores': 'Lojas',
      '/manager/users': 'Gestão de Usuários',
      '/manager/integrations': 'Integrações',
    };
    this.currentTitle = titles[url] || 'Dashboard';
  }

  toggleSidebar(): void {
    const newState = !this.sidebarOpen();
    this.sidebarOpen.set(newState);
    if (this.isSmallScreen()) {
      this.sidebarOverlayOpen.set(newState);
    }
  }

  closeSidebarOverlay(): void {
    this.sidebarOpen.set(false);
    this.sidebarOverlayOpen.set(false);
  }

  private isSmallScreen(): boolean {
    return window.innerWidth <= 768;
  }

  logout(): void {
    this.authService.logout();
    this.uiService.showInfo('Logout realizado', 'Você foi desconectado com sucesso.');
    this.router.navigate(['/auth']);
  }

  isActive(route: string): boolean {
    return this.router.url === route;
  }

  canSeeCampaigns(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT]);
  }

  canSeeManagers(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN]);
  }

  canSeeTenantManagement(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER]);
  }

  canSeeIntegrations(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.OPERATIONAL]);
  }

  canSeeOperationalReadouts(): boolean {
    return this.authService.hasAnyRole([Role.OPERATIONAL]);
  }

  canSeeMetrics(): boolean {
    return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT]);
  }

  canSeeClientResults(): boolean {
    return this.authService.hasAnyRole([Role.CLIENT]);
  }

  dashboardLabel(): string {
    const role = this.authService.getCurrentRole();
    if (role === Role.CLIENT) return 'Resultados';
    if (role === Role.MANAGER) return 'Central';
    if (role === Role.PLATFORM_ADMIN) return 'Plataforma';
    if (role === Role.ADMIN) return 'Empresa';
    return 'Operação';
  }

  roleLabel(role: Role | string | null | undefined): string {
    return roleLabel(role);
  }

  userInitials(name: string | null | undefined): string {
    return (name ?? '')
      .split(' ')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2) || 'U';
  }
}
