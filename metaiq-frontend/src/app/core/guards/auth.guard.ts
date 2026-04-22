import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { Observable, map } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(state: RouterStateSnapshot): boolean | Observable<boolean> {
    if (this.authService.isAuthenticated()) {
      return true;
    }

    return this.authService.ensureAuthenticated().pipe(
      map((isAuthenticated) => {
        if (isAuthenticated) {
          return true;
        }

        this.router.navigate(['/auth'], {
          queryParams: { returnUrl: state.url },
        });
        return false;
      }),
    );
  }
}

export const authGuard: CanActivateFn = (route, state) => {
  const guard = inject(AuthGuard);
  return guard.canActivate(state);
};
