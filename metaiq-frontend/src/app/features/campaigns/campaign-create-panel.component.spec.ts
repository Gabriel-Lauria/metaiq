import { signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CampaignCreatePanelComponent } from './campaign-create-panel.component';
import { ApiService } from '../../core/services/api.service';
import { AccountContextService } from '../../core/services/account-context.service';
import { CompanyProfileService } from '../../core/services/company-profile.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';
import { CampaignAiService } from './campaign-ai.service';
import { Router } from '@angular/router';
import { CampaignAiStructuredResponse, CampaignCopilotAnalysisResponse, IntegrationProvider, IntegrationStatus, SyncStatus } from '../../core/models';

describe('CampaignCreatePanelComponent', () => {
  let fixture: ComponentFixture<CampaignCreatePanelComponent>;
  let component: CampaignCreatePanelComponent;
  let api: jasmine.SpyObj<ApiService>;
  let ui: jasmine.SpyObj<UiService>;
  let campaignAi: jasmine.SpyObj<CampaignAiService>;

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
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getIbgeStates',
      'getIbgeCities',
      'getMetaIntegrationStatus',
      'getAdAccounts',
      'getAssets',
      'uploadAsset',
      'createMetaCampaign',
      'retryMetaCampaignRecovery',
    ]);
    ui = jasmine.createSpyObj<UiService>('UiService', ['showWarning', 'showError', 'showSuccess']);
    campaignAi = jasmine.createSpyObj<CampaignAiService>('CampaignAiService', ['suggest', 'analyze']);
    campaignAi.suggest.and.returnValue(of(buildStructuredSuggestion()));
    campaignAi.analyze.and.returnValue(of(buildCopilotAnalysis()));

    api.getIbgeStates.and.returnValue(of([
      { code: 'PR', name: 'Paraná', ibgeId: 41 },
      { code: 'SP', name: 'São Paulo', ibgeId: 35 },
    ]));
    api.getIbgeCities.and.callFake((uf: string) => of(
      uf === 'PR'
        ? [
          { id: 4106902, name: 'Curitiba' },
          { id: 4113700, name: 'Londrina' },
        ]
        : uf === 'SP'
          ? [{ id: 3550308, name: 'São Paulo' }]
          : [],
    ));
    api.getMetaIntegrationStatus.and.returnValue(of({
      id: 'integration-1',
      storeId: 'store-1',
      provider: IntegrationProvider.META,
      status: IntegrationStatus.CONNECTED,
      pageId: 'page-1',
      pageName: 'MetaIQ Page',
      lastSyncStatus: SyncStatus.SUCCESS,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    api.getAdAccounts.and.returnValue(of([{
      id: 'ad-account-1',
      name: 'Conta Meta',
      userId: 'user-1',
      provider: IntegrationProvider.META,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]));
    api.getAssets.and.returnValue(of([]));
    api.createMetaCampaign.and.returnValue(of({
      campaignId: 'campaign-1',
      adSetId: 'adset-1',
      creativeId: 'creative-1',
      adId: 'ad-1',
      status: 'CREATED',
      executionStatus: 'COMPLETED',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      platform: 'META',
    }));
    api.retryMetaCampaignRecovery.and.returnValue(of({
      success: true,
      message: 'Campanha retomada',
      executionId: 'exec-1',
      executionStatus: 'COMPLETED',
      ids: {
        campaignId: 'campaign-1',
        adSetId: 'adset-1',
        creativeId: 'creative-1',
        adId: 'ad-1',
      },
    }));

    await TestBed.configureTestingModule({
      imports: [CampaignCreatePanelComponent],
      providers: [
        { provide: ApiService, useValue: api },
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
              businessName: 'Pet Feliz',
              businessSegment: 'Pet shop',
              city: 'Curitiba',
              state: 'PR',
              website: 'https://metaiq.dev/oferta',
              instagram: '@petfeliz',
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
            getValidSelectedStoreId: () => 'store-1',
            select: jasmine.createSpy('select'),
          },
        },
        { provide: UiService, useValue: ui },
        { provide: CampaignAiService, useValue: campaignAi },
        { provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigate']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignCreatePanelComponent);
    component = fixture.componentInstance;
    applyValidState(component);
    fixture.detectChanges();
  });

  it('renderiza erro enriquecido com hint, etapa traduzida e recursos parciais', () => {
    openAdvancedMode(component, fixture);
    component.reviewNow();
    component.submitFailure.set({
      message: 'Erro na criação do criativo: destination_url inválido',
      step: 'creative',
      currentStep: 'creative',
      executionId: 'exec-123',
      executionStatus: 'PARTIAL',
      canRetry: true,
      retryCount: 1,
      userMessage: 'A Meta recusou o criativo. Revise a URL final e continue a execução com segurança.',
      hint: 'Verifique se o pageId está configurado e se a URL é válida',
      partialIds: {
        campaignId: 'cmp-1',
        adSetId: 'set-1',
      },
      stepState: {
        campaign: { status: 'COMPLETED' },
        adset: { status: 'COMPLETED' },
        creative: { status: 'FAILED', errorMessage: 'destination_url inválido' },
        ad: { status: 'PENDING' },
        persist: { status: 'PENDING' },
      },
      metaError: {
        message: 'Invalid parameter',
        code: 100,
        subcode: 1885316,
      },
    });
    component.submitError.set('Erro na criação do criativo: destination_url inválido');
    component.technicalErrorOpen.set(true);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Não foi possível criar a campanha na Meta');
    expect(text).toContain('Criativo');
    expect(text).toContain('Verifique se o pageId está configurado e se a URL é válida');
    expect(text).toContain('cmp-1');
    expect(text).toContain('set-1');
    expect(text).not.toContain('accessToken');
    expect(text).not.toContain('Bearer');
    expect(text).not.toContain('stack');
  });

  it('bloqueia retry normal quando existe execução parcial ativa', () => {
    openAdvancedMode(component, fixture);
    component.reviewNow();
    component.submitFailure.set({
      message: 'Execução parcial',
      executionId: 'exec-123',
      executionStatus: 'PARTIAL',
      canRetry: true,
      partialIds: { campaignId: 'cmp-1' },
    });
    component.partialExecutionSignature.set(JSON.stringify(component.buildApiPayload()));

    component.submit();

    expect(api.createMetaCampaign).not.toHaveBeenCalled();
    expect(ui.showWarning).toHaveBeenCalled();
    expect(component.submitButtonDisabled()).toBeTrue();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Continuar criação com segurança');
  });

  it('aciona o recovery seguro ao continuar de onde parou', () => {
    component.submitFailure.set({
      message: 'Execução parcial',
      executionId: 'exec-123',
      executionStatus: 'PARTIAL',
      canRetry: true,
      partialIds: { campaignId: 'cmp-1' },
    });
    component.partialExecutionSignature.set(JSON.stringify(component.buildApiPayload()));

    component.continuePartialCreation();

    expect(api.retryMetaCampaignRecovery).toHaveBeenCalledWith(
      'store-1',
      'exec-123',
      jasmine.objectContaining({
        name: 'Campanha Meta segura',
        adAccountId: 'ad-account-1',
      }),
    );
    expect(ui.showSuccess).toHaveBeenCalledWith(
      'Campanha retomada',
      'Campanha retomada',
    );
    expect(component.successOverlay()).toBeTruthy();
  });

  it('desabilita o botão principal durante loading', () => {
    openAdvancedMode(component, fixture);
    component.reviewNow();
    component.submitting.set(true);
    fixture.detectChanges();

    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('.review-actions .btn.btn-primary');
    expect(button?.disabled).toBeTrue();
    expect(button?.textContent).toContain('Criando campanha na Meta');
  });

  it('renderiza planner e review estruturados da IA', () => {
    openAiResultMode(component, fixture);
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion();
    component.state.ui.aiConfidence = 74;
    component.state.ui.aiQualityScore = 78;
    component.creationMode.set('ai-result');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Banho e Tosa Curitiba | WhatsApp');
    expect(text).toContain('Campanha local focada em conversas com intenção imediata.');
    expect(text).toContain('Dados assumidos');
    expect(text).toContain('Informações faltantes');
    expect(text).toContain('Recomendações');
    expect(text).toContain('Qualidade IA');
    expect(text).toContain('78/100');
    expect(text).toContain('74/100');
  });

  it('resume prontidão, qualidade e progresso com labels contextuais', () => {
    openGuidedMode(component, fixture);
    component.state.campaign.name = '';
    component.state.destination.websiteUrl = '';
    component.state.creative.headline = '';
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion();
    component.state.ui.aiValidationStale = false;
    component.touchState();
    fixture.detectChanges();

    const cards = component.builderScoreCards();
    expect(cards[0].title).toBe('Prontidão da campanha');
    expect(cards[0].detail).toContain('Faltam 3 itens obrigatórios');
    expect(cards[1].meta).toBe('Qualidade IA: 78/100');
    expect(cards[2].meta).toContain('Etapa');

    const previewCard = fixture.nativeElement.querySelector('.preview-sidebar-block') as HTMLElement | null;
    expect(previewCard?.textContent).toContain('Preview');
    expect(fixture.nativeElement.textContent).toContain('Objetivo');
  });

  it('inicia em modo manual sem exigir prompt da IA', () => {
    expect(component.creationEntryMode()).toBe('manual');
    expect(component.creationMode()).toBe('edit-lite');
    expect(fixture.nativeElement.querySelector('#builder-lite')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Manual');
    expect(fixture.nativeElement.textContent).toContain('Usar IA');
    expect(fixture.nativeElement.textContent).toContain('Configuração');
  });

  it('inicia em modo assistido por IA quando solicitado', () => {
    component.initialMode = 'ai';
    fixture.detectChanges();

    expect(component.creationEntryMode()).toBe('ai');
    expect(component.creationMode()).toBe('ai-entry');
    expect(fixture.nativeElement.querySelector('#builder-ai')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Briefing IA');
  });

  it('modo manual consegue seguir para revisao final sem gerar sugestao da IA', () => {
    openGuidedMode(component, fixture);
    component.reviewNow();

    expect(component.creationEntryMode()).toBe('manual');
    expect(component.creationMode()).toBe('edit-lite');
    expect(component.activeSection()).toBe('builder-review');
    expect(component.showCreateButtonInReview()).toBeTrue();
  });

  it('alternar para manual remove o briefing IA como foco inicial', () => {
    component.initialMode = 'ai';
    fixture.detectChanges();

    component.switchToManualMode();
    fixture.detectChanges();

    expect(component.creationEntryMode()).toBe('manual');
    expect(component.creationMode()).toBe('edit-lite');
    expect(component.activeSection()).toBe('builder-lite');
    expect(fixture.nativeElement.querySelector('#builder-ai')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Configuração');
    expect(fixture.nativeElement.textContent).toContain('Objetivo');
  });

  it('bloqueia avançar quando a etapa atual está inválida', () => {
    openGuidedMode(component, fixture);
    component.state.campaign.objective = '' as any;
    component.state.ui.simpleObjective = '' as any;
    component.touchState();

    component.advanceStep();
    fixture.detectChanges();

    expect(component.currentStep()).toBe('configuration');
    expect(component.canAdvanceCurrentStep()).toBeFalse();
  });

  it('permite navegar pelas etapas válidas do wizard', () => {
    openGuidedMode(component, fixture);
    component.touchState();
    fixture.detectChanges();
    component.advanceStep();
    expect(component.currentStep()).toBe('audience');
    component.advanceStep();
    expect(component.currentStep()).toBe('creative');
  });

  it('atualiza a prévia do anúncio em tempo real', () => {
    openGuidedMode(component, fixture);
    component.currentStep.set('creative');
    component.state.creative.message = 'Seu pet merece cuidado imediato.';
    component.state.creative.headline = 'Agende hoje mesmo';
    component.state.creative.imageUrl = 'https://metaiq.dev/preview.jpg';
    fixture.detectChanges();

    const preview = fixture.nativeElement.querySelector('.preview-sidebar-block') as HTMLElement | null;
    const image = fixture.nativeElement.querySelector('app-creative-preview img') as HTMLImageElement | null;

    expect(preview?.textContent).toContain('Seu pet merece cuidado imediato.');
    expect(preview?.textContent).toContain('Agende hoje mesmo');
    expect(image?.src).toContain('https://metaiq.dev/preview.jpg');
  });

  it('gera sugestões com IA sem quebrar o preenchimento manual', () => {
    component.switchToAiMode();
    component.state.ui.aiPrompt = 'Campanha local para pet shop com CTA de agendamento';
    component.state.creative.headline = '';
    component.state.creative.message = '';
    component.state.creative.description = '';
    component.applyAiSuggestions();

    expect(campaignAi.suggest).toHaveBeenCalled();
    expect(component.creationMode()).toBe('ai-result');
    expect(component.state.ui.aiLastSuggestion).not.toBeNull();
    expect(ui.showSuccess).toHaveBeenCalledWith(
      'Sugestão pronta para revisão',
      'A IA montou uma primeira versão. Revise antes de aplicar ao builder.',
    );
  });

  it('mostra aviso de AI_FAILED e não exibe score nem estratégia fake', () => {
    campaignAi.suggest.and.returnValue(of({
      status: 'AI_FAILED',
      reason: 'timeout',
      message: 'Não conseguimos gerar a campanha com IA agora.',
      meta: {
        promptVersion: 'campaign-structured-v3.1.0',
        model: 'gemini-2.5-flash',
        usedFallback: false,
        responseValid: false,
      },
    }));

    component.initialMode = 'ai';
    fixture.detectChanges();
    component.state.ui.aiPrompt = 'Gerar campanha para loja local';
    component.applyAiSuggestions();
    fixture.detectChanges();

    expect(ui.showWarning).toHaveBeenCalled();
    expect(component.state.ui.aiFailure?.message).toContain('Não conseguimos gerar a campanha com IA agora');
    expect(component.state.ui.aiLastSuggestion).toBeNull();
    expect(component.state.ui.aiQualityScore).toBeNull();
  });

  it('mostra o painel explicativo da IA com estratégia, melhorias e riscos', () => {
    openAiResultMode(component, fixture);
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sugestão da IA');
    expect(text).toContain('Campanha local focada em conversas');
    expect(text).toContain('Riscos');
    expect(text).toContain('Recomendações');
  });

  it('não sobrescreve headline manual durante a geração da sugestão IA', () => {
    component.switchToAiMode();
    component.state.ui.aiPrompt = 'Campanha para pet shop com foco em leads';
    component.state.creative.headline = 'Título manual mantido';
    component.state.creative.message = '';
    component.state.creative.description = '';
    fixture.detectChanges();

    component.applyAiSuggestions();

    expect(component.state.creative.headline).toBe('Título manual mantido');
    expect(component.state.ui.aiLastSuggestion).not.toBeNull();
  });

  it('envia a campanha a partir da revisão mantendo compatibilidade do payload', () => {
    openAdvancedMode(component, fixture);
    component.reviewNow();
    component.submit();

    expect(api.createMetaCampaign).toHaveBeenCalledWith('store-1', jasmine.objectContaining({
      name: 'Campanha Meta segura',
      adAccountId: 'ad-account-1',
      imageUrl: 'https://metaiq.dev/image.jpg',
    }));
  });

  it('renderiza tooltips apenas nos campos estratégicos', () => {
    openAdvancedMode(component, fixture);
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.form-field span')) as HTMLElement[];
    const tooltipTexts = Array.from(
      fixture.nativeElement.querySelectorAll('.tooltip-bubble') as NodeListOf<HTMLElement>,
    ).map((item) => item.textContent?.trim() || '');

    expect(tooltipTexts.some((text) => text.includes('Ideal para cliques'))).toBeTrue();
    expect(tooltipTexts.some((text) => text.includes('botão do anúncio'))).toBeTrue();
    expect(tooltipTexts.some((text) => text.includes('quem você quer alcançar'))).toBeTrue();
    expect(labels.some((label) => label.textContent?.includes('Nome') && label.querySelector('.field-tooltip'))).toBeFalse();
    expect(labels.some((label) => label.textContent?.includes('URL') && label.querySelector('.field-tooltip'))).toBeFalse();
    expect(labels.some((label) => label.textContent?.includes('Orçamento') && label.querySelector('.field-tooltip'))).toBeFalse();
  });

  it('aplica a sugestão estruturada diretamente no formulário sem parsing por regex', () => {
    const initialState = (component as any).initialState;
    component.state.campaign.name = '';
    component.state.creative.headline = '';
    component.state.creative.message = '';
    component.state.destination.websiteUrl = '';
    component.state.audience.interests = '';
    component.state.budget.value = initialState.budget.value;
    component.state.budget.quickBudget = initialState.budget.quickBudget;
    component.state.audience.country = initialState.audience.country;
    component.state.audience.city = initialState.audience.city;
    component.state.audience.ageMin = initialState.audience.ageMin;
    component.state.audience.ageMax = initialState.audience.ageMax;
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion();

    component.applyCurrentAiSuggestion();

    expect(component.state.campaign.name).toBe('Banho e Tosa Curitiba | WhatsApp');
    expect(component.state.campaign.objective).toBe('OUTCOME_LEADS');
    expect(component.state.budget.value).toBe(80);
    expect(component.state.audience.country).toBe('BR');
    expect(component.state.audience.state).toBe('PR');
    expect(component.state.audience.stateName).toBe('Paraná');
    expect(component.state.audience.city).toBe('Curitiba');
    expect(Number(component.state.audience.cityId)).toBe(4106902);
    expect(component.state.creative.message).toContain('Seu pet limpo');
    expect(component.state.creative.headline).toBe('Agende banho e tosa');
    expect(component.state.destination.websiteUrl).toBe('https://metaiq.dev/agendar');
    expect(component.state.ui.aiIgnoredFields).toEqual([]);
  });

  it('aplica Curitiba PR nos selects reais e no payload final', () => {
    component.state.campaign.name = '';
    component.state.audience.state = '';
    component.state.audience.stateName = '';
    component.state.audience.region = '';
    component.state.audience.city = '';
    component.state.audience.cityId = null;
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      adSet: {
        ...buildStructuredSuggestion().adSet,
        targeting: {
          ...buildStructuredSuggestion().adSet.targeting,
          country: 'BR',
          state: 'Paraná',
          stateCode: 'PR',
          city: 'Curitiba',
        },
      },
    });

    component.applyCurrentAiSuggestion();

    const payload = component.buildApiPayload();
    expect(component.state.audience.country).toBe('BR');
    expect(component.state.audience.state).toBe('PR');
    expect(component.state.audience.stateName).toBe('Paraná');
    expect(component.state.audience.city).toBe('Curitiba');
    expect(Number(component.state.audience.cityId)).toBe(4106902);
    expect(payload.state).toBe('PR');
    expect(payload.stateName).toBe('Paraná');
    expect(payload.city).toBe('Curitiba');
    expect(Number(payload.cityId)).toBe(4106902);
  });

  it('nao aplica cidade como valida quando a IA retorna cidade sem UF e mostra aviso', () => {
    component.state.audience.state = '';
    component.state.audience.stateName = '';
    component.state.audience.region = '';
    component.state.audience.city = '';
    component.state.audience.cityId = null;
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      adSet: {
        ...buildStructuredSuggestion().adSet,
        targeting: {
          ...buildStructuredSuggestion().adSet.targeting,
          state: null,
          stateCode: null,
          city: 'Curitiba',
        },
      },
    });

    component.applyCurrentAiSuggestion();

    expect(component.state.audience.state).toBe('');
    expect(component.state.audience.city).toBe('');
    expect(component.state.audience.cityId).toBeNull();
    expect(component.state.ui.aiGeoPendingNotice).toContain('não conseguiu confirmar o estado');
    expect(ui.showWarning).toHaveBeenCalledWith('UF pendente', 'A IA identificou a cidade, mas não conseguiu confirmar o estado. Selecione a UF para continuar.');
    expect(component.fieldInvalid('audience.location')).toBeFalse();
    component.markFieldTouched('audience.location');
    expect(component.fieldInvalid('audience.location')).toBeTrue();
  });

  it('normaliza cidade e UF com caixa diferente antes de preencher os selects', () => {
    component.state.audience.state = '';
    component.state.audience.stateName = '';
    component.state.audience.region = '';
    component.state.audience.city = '';
    component.state.audience.cityId = null;
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      adSet: {
        ...buildStructuredSuggestion().adSet,
        targeting: {
          ...buildStructuredSuggestion().adSet.targeting,
          state: 'paraná',
          stateCode: 'pr',
          city: 'CURITIBA',
        },
      },
    });

    component.applyCurrentAiSuggestion();

    expect(component.state.audience.state).toBe('PR');
    expect(component.state.audience.stateName).toBe('Paraná');
    expect(component.state.audience.city).toBe('Curitiba');
    expect(Number(component.state.audience.cityId)).toBe(4106902);
  });

  it('nao inventa campos nulos e lista campos invalidos ignorados', () => {
    component.state.destination.websiteUrl = '';
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      creative: {
        ...buildStructuredSuggestion().creative,
        destinationUrl: 'http://metaiq.dev/inseguro',
      },
      adSet: {
        ...buildStructuredSuggestion().adSet,
        targeting: {
          ...buildStructuredSuggestion().adSet.targeting,
          ageMin: 16,
          ageMax: 70,
        },
      },
    });

    component.applyCurrentAiSuggestion();

    expect(component.state.destination.websiteUrl).toBe('');
    expect(component.state.ui.aiIgnoredFields).toContain('URL de destino');
    expect(component.state.ui.aiIgnoredFields).toContain('Idade mínima');
    expect(component.state.ui.aiIgnoredFields).toContain('Idade máxima');
  });

  it('renderiza blockingIssues, warnings e recommendations da validacao', () => {
    openAiResultMode(component, fixture);
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      validation: {
        isReadyToPublish: false,
        qualityScore: 41,
        blockingIssues: ['A campanha precisa de uma destinationUrl válida em https.'],
        warnings: ['O público está amplo para um orçamento enxuto e pode reduzir a eficiência inicial.'],
        recommendations: ['Segmente melhor o público para reduzir dispersão inicial.'],
      },
    });
    component.creationMode.set('ai-result');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('A campanha precisa de uma destinationUrl válida em https.');
    expect(text).toContain('O público está amplo para um orçamento enxuto e pode reduzir a eficiência inicial.');
    expect(text).toContain('Segmente melhor o público para reduzir dispersão inicial.');
    expect(text).toContain('Revisão necessária antes de publicar');
  });

  it('bloqueia envio quando existem blockingIssues da validacao da IA', () => {
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      validation: {
        isReadyToPublish: false,
        qualityScore: 38,
        blockingIssues: ['A campanha precisa de uma destinationUrl válida em https.'],
        warnings: [],
        recommendations: ['Revise manualmente antes de enviar.'],
      },
    });
    component.state.ui.aiValidationStale = false;

    component.submit();

    expect(api.createMetaCampaign).not.toHaveBeenCalled();
    expect(ui.showWarning).toHaveBeenCalledWith('Revisão obrigatória', 'Corrija os problemas obrigatórios antes de enviar a campanha.');
  });

  it('permite envio quando existem apenas warnings da validacao', () => {
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      validation: {
        isReadyToPublish: true,
        qualityScore: 71,
        blockingIssues: [],
        warnings: ['O CTA parece fraco para o objetivo escolhido.'],
        recommendations: ['Melhore a headline para destacar o benefício principal com mais clareza.'],
      },
    });
    component.state.ui.aiValidationStale = false;

    component.submit();

    expect(api.createMetaCampaign).toHaveBeenCalled();
    expect(ui.showWarning).toHaveBeenCalledWith('Atenção antes do envio', 'A campanha pode ter performance reduzida. Revise os warnings antes de publicar.');
  });

  it('marca a validacao como desatualizada quando o formulario muda apos aplicar a IA', () => {
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion();
    component.state.ui.aiApplied = true;
    component.state.ui.aiValidationStale = false;

    component.state.creative.headline = 'Nova headline manual';
    component.touchState();

    expect(component.state.ui.aiValidationStale).toBeTrue();
  });

  it('aplica cor por faixa de score conforme a regra do builder', () => {
    expect(component.scoreColor(25)).toBe('#DC2626');
    expect(component.scoreColor(55)).toBe('#F59E0B');
    expect(component.scoreColor(78)).toBe('#2563EB');
    expect(component.scoreColor(95)).toBe('#16A34A');
  });

  it('mostra o botao de analisar campanha nas etapas de criativo e revisao', () => {
    openAdvancedMode(component, fixture);

    expect(fixture.nativeElement.textContent).toContain('✨ Analisar campanha');

    component.reviewNow();
    fixture.detectChanges();

    const reviewSection = fixture.nativeElement.querySelector('#builder-review') as HTMLElement | null;

    expect(reviewSection?.textContent).toContain('✨ Analisar campanha');
  });

  it('envia payload estruturado ao analisar campanha', () => {
    component.state.creative.cta = 'LEARN_MORE';
    component.state.audience.interests = 'pet shop, banho e tosa';

    component.analyzeCampaignWithAi();

    expect(campaignAi.analyze).toHaveBeenCalled();
    const payload = campaignAi.analyze.calls.mostRecent().args[0];
    expect(payload.storeId).toBe('store-1');
    expect(payload.campaign['name']).toBe('Campanha Meta segura');
    expect(payload.objective).toBe('OUTCOME_LEADS');
    expect(payload.creative?.['headline']).toBe('Headline forte');
    expect(payload.targeting?.['interests']).toEqual(['pet shop', 'banho e tosa']);
    expect(payload.destinationUrl).toBe('https://metaiq.dev/oferta');
  });

  it('usa contexto da empresa ao montar a sugestao para IA', () => {
    component.state.ui.aiPrompt = 'Quero gerar mais agendamentos';

    component.applyAiSuggestions();

    const request = campaignAi.suggest.calls.mostRecent().args[0];
    expect(request.region).toBe('Curitiba');
    expect(request.extraContext).toContain('Empresa: Pet Feliz');
    expect(request.extraContext).toContain('Segmento: Pet shop');
    expect(request.extraContext).toContain('WhatsApp: (41) 99999-9999');
  });

  it('renderiza a resposta do copiloto de campanha corretamente', () => {
    openAdvancedMode(component, fixture);
    component.analyzeCampaignWithAi();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Análise da campanha');
    expect(text).toContain('Pontos fortes');
    expect(text).toContain('Problemas');
    expect(text).toContain('Sugestões');
    expect(text).toContain('78/100');
  });

  it('renderiza botao aplicar para melhorias estruturadas do copiloto', () => {
    openAdvancedMode(component, fixture);
    component.analyzeCampaignWithAi();
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.copilot-improvement-actions .btn')) as HTMLButtonElement[];
    expect(buttons.some((button) => button.textContent?.includes('Aplicar'))).toBeTrue();
  });

  it('aplica melhoria estruturada de headline com um clique', () => {
    component.state.creative.headline = 'Headline antiga';
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis();

    const improvement = component.aiCopilotVisibleImprovements().find((item) => item.type === 'headline');
    expect(improvement).toBeTruthy();

    component.applyCopilotImprovement(improvement!);

    expect(component.state.creative.headline).toBe('Agende sua consulta hoje mesmo');
    expect(component.state.ui.aiCopilotAppliedImprovementIds).toContain(improvement!.id);
    expect(component.state.ui.aiCopilotStale).toBeTrue();
  });

  it('nao aplica melhoria automaticamente ao receber a analise', () => {
    component.state.creative.headline = 'Headline original';

    component.analyzeCampaignWithAi();

    expect(component.state.creative.headline).toBe('Headline original');
    expect(component.state.ui.aiCopilotAppliedImprovementIds).toEqual([]);
  });

  it('desfaz a ultima melhoria aplicada pelo copiloto', () => {
    component.state.creative.headline = 'Headline original';
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis();

    const improvement = component.aiCopilotVisibleImprovements().find((item) => item.type === 'headline');
    component.applyCopilotImprovement(improvement!);
    component.undoLastCopilotImprovement();

    expect(component.state.creative.headline).toBe('Headline original');
    expect(component.state.ui.aiCopilotAppliedImprovementIds).not.toContain(improvement!.id);
    expect(component.state.ui.aiCopilotLastAppliedMessage).toContain('desfeita');
  });

  it('nao aplica URL insegura sugerida pelo copiloto', () => {
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        ...buildCopilotAnalysis().analysis,
        improvements: [
          {
            id: 'url-insecure',
            type: 'url',
            label: 'URL insegura',
            description: 'Teste inválido',
            suggestedValue: 'http://metaiq.dev/inseguro',
            confidence: 61,
          },
        ],
      },
    });

    component.applyCopilotImprovement(component.aiCopilotVisibleImprovements()[0]);

    expect(component.state.destination.websiteUrl).toBe('https://metaiq.dev/oferta');
    expect(component.state.ui.aiCopilotApplyError).toContain('https');
  });

  it('nao quebra a UI sem resposta de analise anterior', () => {
    component.state.ui.aiCopilotAnalysis = null;
    fixture.detectChanges();

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.textContent).not.toContain('Pontos fortes');
  });

  it('nao bloqueia o fluxo manual por causa da analise do copiloto', () => {
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        summary: 'Existe ajuste pendente.',
        strengths: [],
        issues: ['CTA fraco para o objetivo.'],
        improvements: [{
          id: 'cta-direct',
          type: 'cta',
          label: 'CTA mais direto',
          description: 'Troque o CTA por algo mais direto.',
          suggestedValue: 'CONTACT_US',
          confidence: 44,
        }],
        confidence: 44,
      },
    });
    component.state.ui.aiCopilotStale = false;

    component.submit();

    expect(api.createMetaCampaign).toHaveBeenCalled();
  });

  it('mantem a confidence do copiloto entre 0 e 100', () => {
    campaignAi.analyze.and.returnValue(of(buildCopilotAnalysis({
      analysis: {
        summary: 'Analise com confidence fora da faixa.',
        strengths: ['Base preenchida'],
        issues: [],
        improvements: [],
        confidence: 140,
      },
    })));

    component.analyzeCampaignWithAi();

    expect(component.aiCopilotConfidenceValue()).toBe(100);
  });
});

function applyValidState(component: CampaignCreatePanelComponent): void {
  component.state.campaign.name = 'Campanha Meta segura';
  component.state.campaign.objective = 'OUTCOME_LEADS';
  component.state.identity.adAccountId = 'ad-account-1';
  component.state.ui.simpleObjective = 'sell-more';
  component.state.ui.productName = 'Banho e tosa premium';
  component.state.ui.productDescription = 'Serviço com agendamento rápido pelo WhatsApp.';
  component.state.ui.productDifferential = 'Atendimento no mesmo dia';
  component.state.ui.productPrice = 'A partir de R$79';
  component.state.audience.country = 'BR';
  component.state.audience.state = 'PR';
  component.state.audience.stateName = 'Paraná';
  component.state.audience.region = 'Paraná';
  component.state.budget.value = 120;
  component.state.destination.type = 'site';
  component.state.destination.websiteUrl = 'https://metaiq.dev/oferta';
  component.state.creative.message = 'Mensagem principal';
  component.state.creative.headline = 'Headline forte';
  component.state.creative.imageUrl = 'https://metaiq.dev/image.jpg';
  component.state.tracking.mainEvent = 'Lead';
  component.state.tracking.pixel = 'pixel-1';
}

function openGuidedMode(
  component: CampaignCreatePanelComponent,
  fixture: ComponentFixture<CampaignCreatePanelComponent>,
): void {
  component.switchToManualMode();
  component.enableStepFlow();
  component.touchState();
  fixture.detectChanges();
}

function openAdvancedMode(
  component: CampaignCreatePanelComponent,
  fixture: ComponentFixture<CampaignCreatePanelComponent>,
): void {
  component.openAdvancedBuilder();
  fixture.detectChanges();
}

function openAiResultMode(
  component: CampaignCreatePanelComponent,
  fixture: ComponentFixture<CampaignCreatePanelComponent>,
): void {
  component.switchToAiMode();
  component.creationMode.set('ai-result');
  fixture.detectChanges();
}

function buildStructuredSuggestion(
  overrides: Partial<CampaignAiStructuredResponse> = {},
): CampaignAiStructuredResponse {
  return {
    status: 'AI_SUCCESS',
    strategy: 'Campanha local focada em conversas com intenção imediata e benefício claro.',
    primaryText: 'Seu pet limpo, cheiroso e bem cuidado em Curitiba. Fale com a equipe e agende.',
    headline: 'Agende banho e tosa',
    description: 'Atendimento rápido para bairros próximos.',
    cta: 'LEARN_MORE',
    audience: {
      gender: 'all',
      ageRange: '25-55',
      interests: ['pet shop', 'banho e tosa'],
    },
    budgetSuggestion: 80,
    risks: ['Sem prova social validada na landing page'],
    improvements: ['Revisar bairros atendidos antes de enviar'],
    reasoning: [
      'A estratégia usa o contexto local da store.',
      'O público prioriza tutores com intenção de agendar.',
      'A copy reforça benefício imediato e próximo passo simples.',
      'O orçamento parte de um teste controlado antes de escalar.',
    ],
    explanation: {
      strategy: 'A campanha foi montada para gerar conversas rápidas com quem já tem intenção de contratar.',
      audience: 'A segmentação busca tutores de pets em Curitiba com sinais de interesse em cuidado recorrente.',
      copy: 'O texto destaca dor, benefício e CTA direto para reduzir fricção.',
      budget: 'O orçamento inicial foi tratado como teste seguro para validar resposta real.',
    },
    planner: {
      businessType: 'serviço local',
      goal: 'Gerar agendamentos no WhatsApp',
      funnelStage: 'bottom',
      offer: 'Banho e tosa com agendamento',
      audienceIntent: 'Tutores de cães e gatos em Curitiba com intenção de agendar nos próximos dias.',
      missingInputs: ['Bairros prioritários', 'Oferta promocional vigente'],
      assumptions: ['A loja atende Curitiba e arredores.'],
      ...(overrides.planner || {}),
    },
    campaign: {
      campaignName: 'Banho e Tosa Curitiba | WhatsApp',
      objective: 'OUTCOME_LEADS',
      buyingType: 'AUCTION',
      status: 'PAUSED',
      budget: {
        type: 'daily',
        amount: 80,
        currency: 'BRL',
      },
      ...(overrides.campaign || {}),
    },
    adSet: {
      name: 'Publico tutores Curitiba',
      optimizationGoal: 'LEADS',
      billingEvent: 'IMPRESSIONS',
      targeting: {
        country: 'BR',
        state: 'Paraná',
        stateCode: 'PR',
        city: 'Curitiba',
        ageMin: 25,
        ageMax: 55,
        gender: 'all',
        interests: ['pet shop', 'banho e tosa'],
        excludedInterests: [],
        placements: ['feed', 'stories'],
      },
      ...(overrides.adSet || {}),
    },
    creative: {
      name: 'Criativo 1',
      primaryText: 'Seu pet limpo, cheiroso e bem cuidado em Curitiba. Fale com a equipe e agende.',
      headline: 'Agende banho e tosa',
      description: 'Atendimento rápido para bairros próximos.',
      cta: 'LEARN_MORE',
      imageSuggestion: 'Antes e depois do banho e tosa com foco em confiança.',
      destinationUrl: 'https://metaiq.dev/agendar',
      ...(overrides.creative || {}),
    },
    review: {
      summary: 'Campanha local focada em conversas com intenção imediata.',
      strengths: ['Objetivo aderente ao serviço local'],
      risks: ['Sem prova social validada na landing page'],
      recommendations: ['Revisar bairros atendidos antes de enviar'],
      confidence: 74,
      ...(overrides.review || {}),
    },
    validation: {
      isReadyToPublish: true,
      qualityScore: 78,
      blockingIssues: [],
      warnings: ['O CTA pode ficar mais específico para aumentar clareza do próximo passo.'],
      recommendations: ['Adicione prova social na descrição ou na landing page.'],
      ...(overrides.validation || {}),
    },
    meta: {
      promptVersion: 'campaign-structured-v3.0.0',
      model: 'gemini-2.5-flash',
      usedFallback: false,
      responseValid: true,
      ...(overrides.meta || {}),
    },
  };
}

function buildCopilotAnalysis(overrides: Partial<CampaignCopilotAnalysisResponse> = {}): CampaignCopilotAnalysisResponse {
  return {
    status: 'AI_SUCCESS',
    analysis: {
      summary: 'A campanha está bem montada, mas ainda pode ganhar precisão no público e no CTA.',
      strengths: ['Objetivo, URL e headline estão alinhados.'],
      issues: ['Seu público está muito amplo para o orçamento definido.'],
      improvements: [
        {
          id: 'headline-direct',
          type: 'headline',
          label: 'Headline pode ser mais direta',
          description: 'A headline ainda pode conduzir melhor o próximo passo.',
          suggestedValue: 'Agende sua consulta hoje mesmo',
          confidence: 81,
        },
        {
          id: 'cta-direct',
          type: 'cta',
          label: 'CTA pode ficar mais acionável',
          description: 'Troque o CTA para um próximo passo mais claro.',
          suggestedValue: 'CONTACT_US',
          confidence: 77,
        },
      ],
      confidence: 78,
      ...(overrides.analysis || {}),
    },
    meta: {
      promptVersion: 'campaign-copilot-v1.0.0',
      model: 'gemini-2.5-flash',
      usedFallback: false,
      responseValid: true,
      ...(overrides.meta || {}),
    },
  };
}
