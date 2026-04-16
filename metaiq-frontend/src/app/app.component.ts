import { Component, inject, signal, effect } from '@angular/core';
import { AsyncPipe, DatePipe, NgIf } from '@angular/common';
import { Router, NavigationEnd, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { UiService } from './core/services/ui.service';
import { NotificationContainerComponent } from './core/components/notification-container.component';
import { GlobalLoadingComponent } from './core/components/global-loading.component';
import { Role } from './core/models';
import { filter } from 'rxjs';

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
    GlobalLoadingComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
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
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updatePageTitle();
        // Fechar overlay ao navegar em mobile
        if (this.isSmallScreen()) {
          this.sidebarOpen.set(false);
          this.sidebarOverlayOpen.set(false);
        }
      });

    // Persistir estado da sidebar quando mudar
    effect(() => {
      const state = this.sidebarOpen();
      // Só salvar estado collapsed em desktop (mobile sempre volta collapsed)
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
      '/dashboard': role === Role.CLIENT ? 'Resumo da Loja' : role === Role.MANAGER ? 'Central do Tenant' : [Role.PLATFORM_ADMIN, Role.ADMIN].includes(role as Role) ? 'Administração' : 'Operação da Loja',
      '/campaigns': 'Campanhas Ativas',
      '/metrics': 'Métricas',
      '/insights': 'Insights',
      '/results': 'Resultados',
      '/admin/managers': 'Gestão de Managers',
      '/manager/stores': 'Gestão de Stores',
      '/manager/users': 'Gestão de Usuários',
      '/manager/integrations': 'Integrações'
    };
    this.currentTitle = titles[url] || 'Dashboard';
  }

  toggleSidebar(): void {
    const newState = !this.sidebarOpen();
    this.sidebarOpen.set(newState);
    // No mobile, abrir overlay quando sidebar abre
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
    return this.authService.hasAnyRole([Role.ADMIN, Role.MANAGER, Role.OPERATIONAL]);
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

  canSeeClientResults(): boolean {
    return this.authService.hasAnyRole([Role.CLIENT]);
  }

  dashboardLabel(): string {
    const role = this.authService.getCurrentRole();
    if (role === Role.CLIENT) return 'Resumo';
    if (role === Role.MANAGER) return 'Central';
    if (role === Role.PLATFORM_ADMIN) return 'Plataforma';
    if (role === Role.ADMIN) return 'Dashboard Admin';
    return 'Operação';
  }
}
