import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AccountContextService } from '../../core/services/account-context.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UiService } from '../../core/services/ui.service';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../core/models';
import { IntegrationsComponent } from './integrations.component';

describe('IntegrationsComponent', () => {
  let fixture: ComponentFixture<IntegrationsComponent>;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getAccessibleStores',
      'getStores',
      'getMetaIntegrationStatus',
      'getMetaAdAccounts',
      'getMetaPages',
    ]);

    const stores = [{
      id: 'store-1',
      name: 'Empresa unica',
      managerId: 'manager-1',
      tenantId: 'tenant-1',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];
    api.getAccessibleStores.and.returnValue(of(stores));
    api.getStores.and.returnValue(of(stores));
    api.getMetaIntegrationStatus.and.returnValue(of({
      id: 'integration-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      status: IntegrationStatus.CONNECTED,
      pageId: 'page-1',
      pageName: 'Pagina principal',
      lastSyncStatus: SyncStatus.SUCCESS,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    api.getMetaAdAccounts.and.returnValue(of([]));
    api.getMetaPages.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [IntegrationsComponent],
      providers: [
        { provide: ApiService, useValue: api },
        {
          provide: AuthService,
          useValue: {
            getCurrentRole: () => Role.ADMIN,
            hasAnyRole: () => true,
          },
        },
        {
          provide: AccountContextService,
          useValue: {
            isIndividualAccount: () => true,
          },
        },
        {
          provide: UiService,
          useValue: jasmine.createSpyObj<UiService>('UiService', ['showWarning', 'showInfo', 'showError']),
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({}),
            snapshot: {
              queryParamMap: {
                get: () => null,
              },
            },
          },
        },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigate']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IntegrationsComponent);
    fixture.detectChanges();
  });

  it('does not render the store selector for individual accounts', () => {
    expect(api.getStores).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.store-panel')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Minha conta Meta');
  });
});
