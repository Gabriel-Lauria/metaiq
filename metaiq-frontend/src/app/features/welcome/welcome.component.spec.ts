import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { WelcomeComponent } from './welcome.component';
import { ApiService } from '../../core/services/api.service';
import { AccountContextService } from '../../core/services/account-context.service';
import { AuthService } from '../../core/services/auth.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';
import { IntegrationStatus, Role, SyncStatus } from '../../core/models';

describe('WelcomeComponent', () => {
  let fixture: ComponentFixture<WelcomeComponent>;
  let component: WelcomeComponent;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WelcomeComponent],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            getMetaIntegrationStatus: () => of({
              id: 'integration-1',
              storeId: 'store-1',
              provider: 'META',
              status: IntegrationStatus.CONNECTED,
              pageId: 'page-1',
              pageName: 'Nexora Page',
              lastSyncStatus: SyncStatus.SUCCESS,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
            getAdAccounts: () => of([]),
            getAssets: () => of([]),
            getCampaigns: () => of({
              data: [],
              meta: { total: 0, page: 1, limit: 1, totalPages: 1, hasNext: false, hasPrev: false },
            }),
            updateMyOnboarding: () => of({
              id: 'user-1',
              email: 'owner@metaiq.dev',
              name: 'Owner',
              role: Role.ADMIN,
              accountType: 'INDIVIDUAL',
              storeId: 'store-1',
              firstLogin: false,
              onboardingCompletedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => true,
            getCurrentUser: () => ({
              id: 'user-1',
              email: 'owner@metaiq.dev',
              name: 'Owner',
              role: Role.ADMIN,
              accountType: 'INDIVIDUAL',
              storeId: 'store-1',
              firstLogin: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
            hasAnyRole: () => true,
            updateCurrentUserContext: jasmine.createSpy('updateCurrentUserContext'),
          },
        },
        {
          provide: AccountContextService,
          useValue: {
            isIndividualAccount: () => true,
          },
        },
        {
          provide: StoreContextService,
          useValue: {
            load: jasmine.createSpy('load'),
            loaded: () => true,
            getValidSelectedStoreId: () => 'store-1',
            selectedStore: () => ({
              id: 'store-1',
              name: 'Store teste',
              managerId: 'manager-1',
              tenantId: 'tenant-1',
              active: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        },
        {
          provide: UiService,
          useValue: jasmine.createSpyObj<UiService>('UiService', ['showSuccess', 'showError']),
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture = TestBed.createComponent(WelcomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renderiza o título de boas-vindas', () => {
    expect(fixture.nativeElement.textContent).toContain('Bem-vindo à Nexora');
    expect(component.progressPercent()).toBeGreaterThan(0);
  });

  it('conclui onboarding e envia o usuário para o dashboard', () => {
    component.completeOnboardingAndOpenDashboard();

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
