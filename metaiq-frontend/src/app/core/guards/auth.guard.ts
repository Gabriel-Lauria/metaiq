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
    if (this.authService.isAuthenticated()) {
      const allowedRoles = route.data?.['roles'] as Role[] | undefined;
      if (!allowedRoles?.length || this.authService.hasAnyRole(allowedRoles)) {
        return true;
      }

      this.router.navigate(['/dashboard']);
      return false;
    }

    this.router.navigate(['/auth'], {
      queryParams: { returnUrl: state.url },
    });
    return false;
  }
}

export const authGuard: CanActivateFn = (route, state) => {
  const guard = inject(AuthGuard);
  return guard.canActivate(route, state);
};
