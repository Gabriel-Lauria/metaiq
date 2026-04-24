import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccountType } from '../models';
import { AuthService } from '../services/auth.service';

export const accountTypeGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const allowedAccountTypes = route.data?.['allowedAccountTypes'] as AccountType[] | undefined;
  const disallowedAccountTypes = route.data?.['disallowedAccountTypes'] as AccountType[] | undefined;
  const redirectTo = route.data?.['accountTypeRedirectTo'] as string | undefined;
  const currentAccountType = auth.getCurrentUser()?.accountType ?? 'AGENCY';

  if (allowedAccountTypes?.length && !allowedAccountTypes.includes(currentAccountType)) {
    router.navigate([redirectTo || '/campaigns']);
    return false;
  }

  if (disallowedAccountTypes?.length && disallowedAccountTypes.includes(currentAccountType)) {
    router.navigate([redirectTo || '/campaigns']);
    return false;
  }

  return true;
};
