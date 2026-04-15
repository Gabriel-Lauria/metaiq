import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth'], {
        queryParams: { returnUrl: state.url },
      });
      return false;
    }

    return this.canAccessRole(route);
  }

  private canAccessRole(route: ActivatedRouteSnapshot): boolean {
    const roles = route.data['roles'] as Role[] | undefined;
    if (!roles?.length) {
      return true;
    }

    if (this.authService.hasRole(roles)) {
      return true;
    }

    this.router.navigate(['/dashboard']);
    return false;
  }
}

export const authGuard: CanActivateFn = (route, state) => {
  const guard = inject(AuthGuard);
  return guard.canActivate(route, state);
};
