import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { CampaignsComponent } from './campaigns.component';
import { ApiService } from '../../core/services/api.service';
import { AccountContextService } from '../../core/services/account-context.service';
import { AuthService } from '../../core/services/auth.service';
import { CompanyProfileService } from '../../core/services/company-profile.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';
import { CampaignAiService } from './campaign-ai.service';
import { IntegrationProvider, IntegrationStatus, Role, SyncStatus } from '../../core/models';

describe('CampaignsComponent', () => {
  let fixture: ComponentFixture<CampaignsComponent>;
  let component: CampaignsComponent;
  let api: jasmine.SpyObj<ApiService>;
  let router: jasmine.SpyObj<Router>;

  const selectedStoreId = signal('store-1');
  const selectedStore = signal({
    id: 'store-1',
    name: 'Store teste',
    managerId: 'manager-1',
    tenantId: 'tenant-1',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeAll(() => {
    registerLocaleData(localePt);
  });

  beforeEach(async () => {
    localStorage.clear();

    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getCampaigns',
      'getIbgeStates',
      'getIbgeCities',
      'getMetaIntegrationStatus',
      'getAdAccounts',
      'getAssets',
      'createMetaCampaign',
      'retryMetaCampaignRecovery',
      'updateCampaign',
    ]);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    api.getCampaigns.and.returnValue(of({
      data: [],
      meta: { total: 0, page: 1, limit: 500, totalPages: 1, hasNext: false, hasPrev: false },
    }));
    api.getIbgeStates.and.returnValue(of([]));
    api.getIbgeCities.and.returnValue(of([]));
    api.getMetaIntegrationStatus.and.returnValue(of(null as any));
    api.getAdAccounts.and.returnValue(of([]));
    api.getAssets.and.returnValue(of([]));
    api.createMetaCampaign.and.returnValue(of({} as any));
    api.retryMetaCampaignRecovery.and.returnValue(of({} as any));
    api.updateCampaign.and.returnValue(of({} as any));

    await TestBed.configureTestingModule({
      imports: [CampaignsComponent],
      providers: [
        { provide: ApiService, useValue: api },
        {
          provide: AuthService,
          useValue: {
            hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(true),
            currentUser$: of({
              id: 'user-1',
              email: 'owner@metaiq.dev',
              name: 'Owner',
              role: Role.ADMIN,
              accountType: 'AGENCY',
              storeId: null,
            }),
            getCurrentUser: () => ({
              id: 'user-1',
              email: 'owner@metaiq.dev',
              name: 'Owner',
              role: Role.ADMIN,
              accountType: 'AGENCY',
              storeId: null,
            }),
          },
        },
        {
          provide: AccountContextService,
          useValue: {
            isIndividualAccount: () => false,
            fixedStoreId: () => null,
          },
        },
        {
          provide: CompanyProfileService,
          useValue: {
            profile: () => ({
              businessName: '',
              businessSegment: '',
              city: '',
              state: '',
              website: '',
              instagram: '',
              whatsapp: '',
            }),
          },
        },
        {
          provide: StoreContextService,
          useValue: {
            loaded: () => true,
            load: jasmine.createSpy('load'),
            selectedStoreId,
            selectedStore,
            stores: signal([selectedStore()]),
            getValidSelectedStoreId: () => 'store-1',
            hasAccessToStore: () => true,
            select: jasmine.createSpy('select'),
          },
        },
        {
          provide: UiService,
          useValue: jasmine.createSpyObj<UiService>('UiService', ['showWarning', 'showSuccess', 'showError']),
        },
        {
          provide: CampaignAiService,
          useValue: jasmine.createSpyObj<CampaignAiService>('CampaignAiService', ['suggest']),
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({}),
          },
        },
        {
          provide: Router,
          useValue: router,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('clicar em "Criar campanha" abre o painel em modo manual', () => {
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('.header-actions .btn') as NodeListOf<HTMLButtonElement>,
    ).find((element) => element.textContent?.includes('Criar campanha')) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();

    expect(component.createPanelOpen()).toBeTrue();
    expect(component.createPanelMode()).toBe('manual');
  });

  it('clicar em "Criar com IA" abre o painel em modo assistido por IA', () => {
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('.header-actions .btn') as NodeListOf<HTMLButtonElement>,
    ).find((element) => element.textContent?.includes('Criar com IA')) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();

    expect(component.createPanelOpen()).toBeTrue();
    expect(component.createPanelMode()).toBe('ai');
    expect(component.createPanelInitialTarget()).toBeNull();
  });

  it('o painel aberto manualmente renderiza o fluxo manual como padrão', () => {
    component.openCreateCampaign('manual');
    fixture.detectChanges();

    const panelText = fixture.nativeElement.querySelector('app-campaign-create-panel')?.textContent || '';
    expect(panelText).toContain('Criar campanha');
    expect(panelText).toContain('Configuração');
    expect(panelText).not.toContain('Briefing IA');
  });

  it('onboarding aparece para usuário novo', () => {
    expect(component.shouldShowOnboarding()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.onboarding-card')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Comece aqui');
    expect(fixture.nativeElement.textContent).toContain('Conectar conta Meta');
  });

  it('cada item muda status conforme os dados', () => {
    component.integration.set({
      id: 'integration-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      status: IntegrationStatus.CONNECTED,
      pageId: 'page-1',
      pageName: 'Nexora Page',
      lastSyncStatus: SyncStatus.SUCCESS,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    component.syncedAdAccounts.set([{
      id: 'ad-account-1',
      userId: 'user-1',
      provider: IntegrationProvider.META,
      name: 'Conta principal',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
    component.campaigns.set([{ id: 'campaign-1', name: 'Campanha 1', status: 'PAUSED' }]);
    component.onboardingReviewVisited.set(true);
    fixture.detectChanges();

    const items = component.onboardingItems();
    expect(items.every((item) => item.done)).toBeTrue();
  });

  it('clicar no CTA leva para a ação correta', () => {
    const connectButton = Array.from(
      fixture.nativeElement.querySelectorAll('.onboarding-actions .btn') as NodeListOf<HTMLButtonElement>,
    ).find((element) => element.textContent?.includes('Conectar agora')) as HTMLButtonElement;

    connectButton.click();
    expect(router.navigate).toHaveBeenCalledWith(['/manager/integrations'], {
      queryParams: { storeId: 'store-1' },
    });

    router.navigate.calls.reset();
    component.runOnboardingAction('create-campaign');
    expect(component.createPanelOpen()).toBeTrue();
    expect(component.createPanelMode()).toBe('manual');
    expect(component.createPanelInitialTarget()).toBe('configuration');
  });

  it('progresso atualiza corretamente', () => {
    component.integration.set({
      id: 'integration-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      status: IntegrationStatus.CONNECTED,
      pageId: null,
      pageName: null,
      lastSyncStatus: SyncStatus.SUCCESS,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    component.syncedAdAccounts.set([{
      id: 'ad-account-1',
      userId: 'user-1',
      provider: IntegrationProvider.META,
      name: 'Conta principal',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
    fixture.detectChanges();

    expect(component.onboardingCompletedCount()).toBe(2);
    expect(component.onboardingProgressPercent()).toBe(40);
    expect(fixture.nativeElement.textContent).toContain('Progresso: 2 de 5 concluídos');
  });

  it('onboarding pode ser colapsado', () => {
    const collapseButton = fixture.nativeElement.querySelector('.onboarding-header-actions .icon-btn') as HTMLButtonElement;
    collapseButton.click();
    fixture.detectChanges();

    expect(component.onboardingCollapsed()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.onboarding-list')).toBeNull();
  });

  it('onboarding desaparece quando concluído', () => {
    component.integration.set({
      id: 'integration-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      status: IntegrationStatus.CONNECTED,
      pageId: 'page-1',
      pageName: 'Nexora Page',
      lastSyncStatus: SyncStatus.SUCCESS,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    component.syncedAdAccounts.set([{
      id: 'ad-account-1',
      userId: 'user-1',
      provider: IntegrationProvider.META,
      name: 'Conta principal',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
    component.campaigns.set([{ id: 'campaign-1', name: 'Campanha 1', status: 'ACTIVE' }]);
    component.onboardingReviewVisited.set(true);
    fixture.detectChanges();

    expect(component.shouldShowOnboarding()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.onboarding-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('.onboarding-ready')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Seu ambiente está pronto');
  });

  it('oculta o seletor de loja para contas individual', async () => {
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [CampaignsComponent],
      providers: [
        { provide: ApiService, useValue: api },
        {
          provide: AuthService,
          useValue: {
            hasAnyRole: jasmine.createSpy('hasAnyRole').and.returnValue(true),
            currentUser$: of({
              id: 'user-1',
              email: 'owner@metaiq.dev',
              name: 'Owner',
              role: Role.ADMIN,
              accountType: 'INDIVIDUAL',
              storeId: 'store-1',
            }),
            getCurrentUser: () => ({
              id: 'user-1',
              email: 'owner@metaiq.dev',
              name: 'Owner',
              role: Role.ADMIN,
              accountType: 'INDIVIDUAL',
              storeId: 'store-1',
            }),
          },
        },
        {
          provide: AccountContextService,
          useValue: {
            isIndividualAccount: () => true,
            fixedStoreId: () => 'store-1',
          },
        },
        {
          provide: CompanyProfileService,
          useValue: {
            profile: () => ({
              businessName: 'Empresa teste',
              businessSegment: 'Pet',
              city: 'Curitiba',
              state: 'PR',
              website: 'https://metaiq.dev',
              instagram: '@empresa',
              whatsapp: '(41) 99999-9999',
            }),
          },
        },
        {
          provide: StoreContextService,
          useValue: {
            loaded: () => true,
            load: jasmine.createSpy('load'),
            selectedStoreId,
            selectedStore,
            stores: signal([selectedStore()]),
            getValidSelectedStoreId: () => 'store-1',
            hasAccessToStore: () => true,
            select: jasmine.createSpy('select'),
          },
        },
        {
          provide: UiService,
          useValue: jasmine.createSpyObj<UiService>('UiService', ['showWarning', 'showSuccess', 'showError']),
        },
        {
          provide: CampaignAiService,
          useValue: jasmine.createSpyObj<CampaignAiService>('CampaignAiService', ['suggest']),
        },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const storeFilter = fixture.nativeElement.querySelector('select[aria-label="Filtrar campanhas por loja"]');
    expect(storeFilter).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('sem precisar navegar pela estrutura de agência');
  });
});
