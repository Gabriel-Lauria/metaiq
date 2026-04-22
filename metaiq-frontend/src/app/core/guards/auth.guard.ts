import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Role } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | Observable<boolean> {
    if (this.authService.isAuthenticated()) {
      return this.canActivateRole(route);
    }

    return this.authService.ensureAuthenticated().pipe(
      map((isAuthenticated) => {
        if (isAuthenticated) {
          return this.canActivateRole(route);
        }

        this.router.navigate(['/auth'], {
          queryParams: { returnUrl: state.url },
        });
        return false;
      }),
    );
  }

  private canActivateRole(route: ActivatedRouteSnapshot): boolean {
    const allowedRoles = route.data?.['roles'] as Role[] | undefined;
    if (!allowedRoles?.length || this.authService.hasAnyRole(allowedRoles)) {
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
