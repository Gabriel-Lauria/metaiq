import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../models';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const allowedRoles = route.data?.['roles'] as Role[] | undefined;
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!allowedRoles?.length) {
    return true;
  }

  if (authService.hasAnyRole(allowedRoles)) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
