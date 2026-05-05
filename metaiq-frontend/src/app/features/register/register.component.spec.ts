import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UiService } from '../../core/services/ui.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(async () => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['register', 'isAuthenticated', 'getCurrentUser', 'resolveAuthenticatedRoute']);
    authService.isAuthenticated.and.returnValue(false);
    authService.getCurrentUser.and.returnValue(null);
    authService.resolveAuthenticatedRoute.and.returnValue('/welcome');
    authService.register.and.returnValue(of({
      accessToken: 'token',
      user: {
        id: 'user-1',
        email: 'beta@empresa.com',
        name: 'Beta',
        role: 'ADMIN' as any,
        accountType: 'INDIVIDUAL',
        storeId: 'store-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }));

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            getIbgeStates: () => of([{ code: 'PR', name: 'Parana', ibgeId: 41 }]),
            getIbgeCities: () => of([{ id: 1, name: 'Curitiba' }]),
          },
        },
        { provide: AuthService, useValue: authService },
        {
          provide: UiService,
          useValue: jasmine.createSpyObj<UiService>('UiService', ['showSuccess']),
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    spyOn(router, 'navigateByUrl');
    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('valida campos obrigatorios', () => {
    component.submit();
    expect(component.errorMessage).toContain('Verifique os dados');
  });

  it('exige confirmacao de senha igual', () => {
    component.form.patchValue({
      name: 'Beta',
      email: 'beta@empresa.com',
      password: '123456',
      confirmPassword: '654321',
      businessName: 'Empresa Beta',
      defaultState: 'PR',
      defaultCity: 'Curitiba',
    });

    component.submit();

    expect(component.errorMessage).toContain('Senha e confirmação');
  });

  it('envia cadastro com accountType INDIVIDUAL e redireciona para o welcome', () => {
    component.form.patchValue({
      name: 'Beta',
      email: 'beta@empresa.com',
      password: '123456',
      confirmPassword: '123456',
      businessName: 'Empresa Beta',
      businessSegment: 'Consultoria',
      defaultState: 'PR',
      defaultCity: 'Curitiba',
      website: 'https://empresabeta.com.br',
      instagram: '@empresabeta',
      whatsapp: '(41) 99999-9999',
    });

    component.submit();

    expect(authService.register).toHaveBeenCalledWith(jasmine.objectContaining({
      accountType: 'INDIVIDUAL',
      businessName: 'Empresa Beta',
      defaultState: 'PR',
      defaultCity: 'Curitiba',
    }));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/welcome');
  });
});
