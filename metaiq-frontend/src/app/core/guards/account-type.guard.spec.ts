import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { accountTypeGuard } from './account-type.guard';
import { AuthService } from '../services/auth.service';

describe('accountTypeGuard', () => {
  it('bloqueia rotas administrativas para contas individual', () => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        {
          provide: AuthService,
          useValue: {
            getCurrentUser: () => ({
              accountType: 'INDIVIDUAL',
            }),
          },
        },
      ],
    });

    const route = new ActivatedRouteSnapshot();
    route.data = {
      disallowedAccountTypes: ['INDIVIDUAL'],
      accountTypeRedirectTo: '/dashboard',
    };

    const result = TestBed.runInInjectionContext(() => accountTypeGuard(route, {} as any));

    expect(result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('permite a rota minha empresa para contas individual', () => {
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        {
          provide: AuthService,
          useValue: {
            getCurrentUser: () => ({
              accountType: 'INDIVIDUAL',
            }),
          },
        },
      ],
    });

    const route = new ActivatedRouteSnapshot();
    route.data = {
      allowedAccountTypes: ['INDIVIDUAL'],
    };

    const result = TestBed.runInInjectionContext(() => accountTypeGuard(route, {} as any));

    expect(result).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
