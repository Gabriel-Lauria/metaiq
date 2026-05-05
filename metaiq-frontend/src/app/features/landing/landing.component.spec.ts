import { provideRouter, Router, RouterLink } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { LandingComponent } from './landing.component';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => false,
            currentUser$: of(null),
            getCurrentUser: () => null,
            resolveAuthenticatedRoute: () => '/dashboard',
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
  });

  it('renderiza CTA honesto quando o cadastro público está desativado', () => {
    expect(fixture.nativeElement.textContent).toContain('Acessar plataforma');
    expect(fixture.nativeElement.textContent).toContain('Ir para login');
    expect(fixture.nativeElement.textContent).not.toContain('Ver demonstração');
  });

  it('aponta o CTA principal para /auth quando não existe fluxo público', () => {
    const loginLink = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .find((item) => item.nativeElement.textContent.includes('Acessar plataforma'))
      ?.nativeElement as HTMLAnchorElement | undefined;

    expect(loginLink?.getAttribute('href')).toContain('/auth');
  });
});
