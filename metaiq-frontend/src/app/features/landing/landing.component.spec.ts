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
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(LandingComponent);
    fixture.detectChanges();
  });

  it('renderiza CTA para criar conta', () => {
    expect(fixture.nativeElement.textContent).toContain('Começar operação');
  });

  it('aponta o CTA principal para /register', () => {
    const registerLink = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .find((item) => item.nativeElement.textContent.includes('Começar operação'))
      ?.nativeElement as HTMLAnchorElement | undefined;

    expect(registerLink?.getAttribute('href')).toContain('/register');
  });
});
