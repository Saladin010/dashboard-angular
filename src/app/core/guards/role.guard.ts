import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const allowedRoles = (route.data['roles'] as string[]) || [];
  const currentUser = authService.currentUser();

  if (!currentUser) {
    router.navigate(['/login']);
    return false;
  }

  if (allowedRoles.length === 0 || allowedRoles.includes(currentUser.role)) {
    return true;
  }

  // Not authorized for this role, redirect to dashboard home
  router.navigate(['/dashboard']);
  return false;
};
