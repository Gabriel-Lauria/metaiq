import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { UiService } from './core/services/ui.service';
import { Role } from './core/models';
import { NotificationContainerComponent } from './core/components/notification-container.component';
import { GlobalLoadingComponent } from './core/components/global-loading.component';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NotificationContainerComponent,
    GlobalLoadingComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  protected readonly Role = Role;
  private authService = inject(AuthService);
  private uiService = inject(UiService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  
  isAuthenticated$ = this.authService.isAuthenticated$;
  currentUser$ = this.authService.currentUser$;
  currentTitle = 'Dashboard';
  today = new Date();
  sidebarOpen = signal(this.getSavedSidebarState());
  sidebarOverlayOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updatePageTitle();
        // Fechar overlay ao navegar
        this.sidebarOverlayOpen.set(false);
      });

    // Persistir estado da sidebar quando mudar
    effect(() => {
      const state = this.sidebarOpen();
      localStorage.setItem('sidebar-state', state ? 'open' : 'collapsed');
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
    const titles: { [key: string]: string } = {
      '/dashboard': 'Dashboard de Performance',
      '/campaigns': 'Campanhas Ativas'
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

  canSeeCampaigns(userRole: Role | undefined): boolean {
    return !!userRole && [Role.ADMIN, Role.MANAGER, Role.OPERATIONAL].includes(userRole);
  }
}
