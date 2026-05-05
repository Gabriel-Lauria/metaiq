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
    expect(text).toContain('criar a campanha na Meta');
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
    expect(fixture.nativeElement.textContent).toContain('Continuar cria');
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
    expect(text).toContain('faltantes');
    expect(text).toContain('Recomenda');
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

    const previewCard = fixture.nativeElement.querySelector('.wizard-preview-card') as HTMLElement | null;
    expect(previewCard?.textContent).toContain('Prévia');
    expect(fixture.nativeElement.textContent).toContain('Objetivo');
  });

  it('inicia em modo manual sem exigir prompt da IA', () => {
    expect(component.creationEntryMode()).toBe('manual');
    expect(component.creationMode()).toBe('edit-lite');
    expect(fixture.nativeElement.querySelector('#builder-lite')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Manual');
    expect(fixture.nativeElement.textContent).toContain('Trocar modo');
    expect(fixture.nativeElement.textContent).toContain('Integra');
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
    expect(fixture.nativeElement.textContent).toContain('Integra');
    expect(fixture.nativeElement.textContent).toContain('Objetivo');
  });

  it('bloqueia avançar quando a etapa atual está inválida', () => {
    openGuidedMode(component, fixture);
    component.state.campaign.objective = '' as any;
    component.state.ui.simpleObjective = '' as any;
    component.touchState();

    component.advanceStep();
    fixture.detectChanges();

    expect(component.currentStep()).toBe('objective');
    expect(component.canAdvanceCurrentStep()).toBeFalse();
  });

  it('permite navegar pelas etapas válidas do wizard', () => {
    openGuidedMode(component, fixture);
    component.touchState();
    fixture.detectChanges();
    component.advanceStep();
    expect(component.currentStep()).toBe('product');
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

    const preview = fixture.nativeElement.querySelector('.wizard-preview-card') as HTMLElement | null;
    const image = fixture.nativeElement.querySelector('.wizard-ad-media img') as HTMLImageElement | null;

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
    expect(ui.showSuccess).toHaveBeenCalled();
    const [title, message] = ui.showSuccess.calls.mostRecent().args;
    expect(title).toContain('Sugest');
    expect(message).toContain('builder');
  });

  it('libera publicacao quando a IA aprova e nao existem bloqueios locais', () => {
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        overallScore: 92,
        riskLevel: 'LOW',
        isReadyToPublish: true,
        blockingIssues: [],
        warnings: [],
        recommendations: [],
        executiveDecision: {
          decision: 'PUBLISH',
          reason: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
        },
      },
    });
    component.state.ui.aiCopilotStale = false;

    expect(component.submitButtonDisabled()).toBeFalse();
    expect(component.publishReadinessSummary()).toContain('Campanha pronta para publicar');
  });

  it('bloqueia publicacao quando a IA marca a campanha como nao pronta', () => {
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        isReadyToPublish: false,
        executiveDecision: {
          decision: 'PUBLISH',
          reason: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
        },
      },
    });
    component.state.ui.aiCopilotStale = false;

    expect(component.submitButtonDisabled()).toBeTrue();
    expect(component.executiveReviewAlert()).toBe('Esta campanha ainda nao esta segura para publicar.');
  });

  it('bloqueia publicacao quando a analise aponta risco critico', () => {
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        riskLevel: 'CRITICAL',
        isReadyToPublish: false,
      },
    });
    component.state.ui.aiCopilotStale = false;

    expect(component.submitButtonDisabled()).toBeTrue();
    expect(component.executiveReviewAlert()).toBe('Esta campanha ainda nao esta segura para publicar.');
  });

  it('bloqueia publicacao quando a decisao executiva exige correcoes', () => {
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        executiveDecision: {
          decision: 'BLOCK',
          reason: 'Corrija os pontos abaixo antes de gastar dinheiro.',
        },
      },
    });
    component.state.ui.aiCopilotStale = false;

    expect(component.submitButtonDisabled()).toBeTrue();
    expect(component.executiveReviewAlert()).toBe('Corrija os pontos abaixo antes de gastar dinheiro.');
  });

  it('mostra alerta claro quando a IA pede revisao antes da publicacao', () => {
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        executiveDecision: {
          decision: 'REVIEW',
          reason: 'A IA recomenda revisar esta campanha antes da publicacao.',
        },
      },
    });
    component.state.ui.aiCopilotStale = false;

    expect(component.submitButtonDisabled()).toBeTrue();
    expect(component.executiveReviewTitle()).toBe('Corrija antes de publicar');
    expect(component.executiveReviewAlert()).toBe('Esta campanha ainda nao esta segura para publicar.');
  });

  it('mantem bloqueada a publicacao automatica para campanhas de conversa', () => {
    component.state.destination.type = 'messages';
    component.state.destination.websiteUrl = '';
    component.state.destination.messagesDestination = 'WhatsApp Business';
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        riskLevel: 'LOW',
        isReadyToPublish: true,
        blockingIssues: [],
        warnings: [],
        recommendations: [],
        executiveDecision: {
          decision: 'PUBLISH',
          reason: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
        },
      },
    });
    component.state.ui.aiCopilotStale = false;

    expect(component.submitButtonDisabled()).toBeTrue();
    expect(component.publishReadinessSummary()).toBe('Publicacao automatica indisponivel para campanhas de conversa no momento.');
  });

  it('mantem bloqueios locais acima de uma aprovacao da IA', () => {
    component.state.destination.websiteUrl = 'http://metaiq.dev/oferta';
    component.state.ui.aiCopilotAnalysis = buildCopilotAnalysis({
      analysis: {
        riskLevel: 'LOW',
        isReadyToPublish: true,
        blockingIssues: [],
        warnings: [],
        recommendations: [],
        executiveDecision: {
          decision: 'PUBLISH',
          reason: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
        },
      },
    });
    component.state.ui.aiCopilotStale = false;

    expect(component.canSubmit()).toBeFalse();
    expect(component.submitButtonDisabled()).toBeTrue();
    expect(component.submitButtonLabel()).toBe('Corrija antes de publicar');
  });

  it('mantém AI_NEEDS_REVIEW como resposta estruturada e limpa falha antiga', () => {
    campaignAi.suggest.and.returnValue(of(buildStructuredSuggestion({
      status: 'AI_NEEDS_REVIEW',
      validation: {
        ...buildStructuredSuggestion().validation,
        isReadyToPublish: false,
        blockingIssues: ['Campanhas de WhatsApp/mensagens precisam de destino de mensagem configurado.'],
      },
    })));

    component.switchToAiMode();
    component.state.ui.aiPrompt = 'Campanha com foco em WhatsApp';
    component.state.ui.aiFailure = {
      status: 'AI_NEEDS_RETRY',
      reason: 'invalid_response',
      message: 'Falha antiga',
      meta: {
        promptVersion: 'campaign-structured-v3.1.0',
        model: 'gemini-2.5-flash',
        usedFallback: false,
        responseValid: false,
      },
    };

    component.applyAiSuggestions();

    expect(component.state.ui.aiFailure).toBeNull();
    expect(component.state.ui.aiLastSuggestion?.status).toBe('AI_NEEDS_REVIEW');
    expect(component.state.ui.aiBlockingIssues).toContain('Campanhas de WhatsApp/mensagens precisam de destino de mensagem configurado.');
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
    expect(text).toContain('Sugest');
    expect(text).toContain('Campanha local focada em conversas');
    expect(text).toContain('Riscos');
    expect(text).toContain('Recomenda');
  });

  it('exibe ação para usar a sugestão da IA antes de publicar', () => {
    openAiResultMode(component, fixture);
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion();
    component.state.ui.aiApplied = false;
    fixture.detectChanges();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.ai-result-actions .btn') as NodeListOf<HTMLButtonElement>,
    );
    expect(buttons.some((button) => button.textContent?.includes('Usar essa sugest'))).toBeTrue();
  });

  it('confirma aiApplied ao clicar explicitamente em Aplicar ao rascunho', () => {
    const consoleInfoSpy = spyOn(console, 'info');
    openAiResultMode(component, fixture);
    component.state.campaign.objective = 'OUTCOME_TRAFFIC';
    component.state.budget.value = 50;
    component.state.creative.cta = 'LEARN_MORE';
    component.state.ui.aiPrompt = 'Campanha de leads para ecommerce de moda no Brasil com orçamento 120 por dia e CTA falar no WhatsApp.';
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      status: 'AI_NEEDS_REVIEW',
      intent: {
        ...buildStructuredSuggestion().intent,
        objective: 'OUTCOME_LEADS',
        destinationType: 'messages',
        budgetAmount: 120,
        budgetType: 'daily',
        cta: 'MESSAGE_PAGE',
      },
      campaign: {
        ...buildStructuredSuggestion().campaign,
        objective: 'OUTCOME_LEADS',
        budget: {
          type: 'daily',
          amount: 120,
          currency: 'BRL',
        },
      },
      creative: {
        ...buildStructuredSuggestion().creative,
        cta: 'MESSAGE_PAGE',
        destinationUrl: null,
      },
      validation: {
        ...buildStructuredSuggestion().validation,
        isReadyToPublish: false,
        blockingIssues: ['Conecte o destino de mensagens antes de publicar.'],
      },
    });
    component.state.ui.aiApplied = false;
    fixture.detectChanges();

    const applyButton = Array.from(
      fixture.nativeElement.querySelectorAll('.ai-result-actions .btn') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Aplicar ao rascunho'));

    expect(applyButton).toBeTruthy();
    applyButton?.click();
    fixture.detectChanges();

    expect(component.state.ui.aiApplied).toBeTrue();
    expect(component.state.campaign.objective).toBe('OUTCOME_LEADS');
    expect(component.state.budget.value).toBe(120);
    expect(component.state.creative.cta).toBe('MESSAGE_PAGE');
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      'APPLY_AI_SUGGESTION_TRIGGERED',
      jasmine.objectContaining({
        before: jasmine.objectContaining({
          aiApplied: false,
          objective: 'OUTCOME_TRAFFIC',
          budget: 50,
          cta: 'LEARN_MORE',
        }),
      }),
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      'APPLY_AI_SUGGESTION_TRIGGERED',
      jasmine.objectContaining({
        before: jasmine.objectContaining({ aiApplied: false }),
        after: jasmine.objectContaining({
          aiApplied: true,
          objective: 'OUTCOME_LEADS',
          budget: 120,
          cta: 'MESSAGE_PAGE',
        }),
      }),
    );
  });

  it('mostra banner forte quando existe sugestao da IA ainda nao aplicada ao rascunho', () => {
    openAiResultMode(component, fixture);
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion();
    component.state.ui.aiApplied = false;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sugest');
    expect(text).toContain('Aplicar ao rascunho');
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
    expect(tooltipTexts.some((text) => text.toLowerCase().includes('bot'))).toBeTrue();
    expect(tooltipTexts.some((text) => text.toLowerCase().includes('quem'))).toBeTrue();
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
    expect(component.state.destination.websiteUrl).toBe('');
    expect(component.state.ui.aiIgnoredFields).toEqual([]);
  });

  it('bloqueia publicação direta no modo ai-result enquanto a sugestão não foi aplicada ao rascunho', () => {
    openAiResultMode(component, fixture);
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion();
    component.state.ui.aiApplied = false;
    fixture.detectChanges();

    component.submit();

    expect(api.createMetaCampaign).not.toHaveBeenCalled();
    expect(ui.showWarning).toHaveBeenCalled();
    const [title, message] = ui.showWarning.calls.mostRecent().args;
    expect(title).toContain('sugest');
    expect(message).toContain('rascunho');
  });

  it('bloqueia aplicaҧңo quando a sugestңo estҡ em AI_NEEDS_REVIEW', () => {
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      status: 'AI_NEEDS_REVIEW',
      meta: {
        ...buildStructuredSuggestion().meta,
        responseValid: false,
        consistencyApproved: false,
      },
      validation: {
        ...buildStructuredSuggestion().validation,
        blockingIssues: ['A resposta da IA nңo passou na validaҧңo de consistҪncia.'],
      },
    } as Partial<CampaignAiStructuredResponse>);

    component.applyCurrentAiSuggestion();

    expect(ui.showWarning).toHaveBeenCalled();
    const [title, message] = ui.showWarning.calls.mostRecent().args;
    expect(title).toContain('Sugest');
    expect(message).toContain('IA');
    expect(message).toContain('builder');
  });

  it('permite aplicar AI_NEEDS_REVIEW ao rascunho quando a sugestңo ҩ segura', () => {
    component.state.destination.type = 'site';
    component.state.destination.websiteUrl = '';
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      status: 'AI_NEEDS_REVIEW',
      intent: {
        ...buildStructuredSuggestion().intent,
        destinationType: 'messages',
        cta: 'MESSAGE_PAGE',
      },
      creative: {
        ...buildStructuredSuggestion().creative,
        cta: 'MESSAGE_PAGE',
        destinationUrl: null,
      },
      validation: {
        ...buildStructuredSuggestion().validation,
        isReadyToPublish: false,
        blockingIssues: ['Conecte uma Pҡgina, Instagram ou WhatsApp Business antes de publicar campanha de mensagens.'],
      },
    });

    component.applyCurrentAiSuggestion();

    expect(component.state.destination.type).toBe('messages');
    expect(component.state.destination.websiteUrl).toBe('');
    expect(component.state.creative.cta).toBe('MESSAGE_PAGE');
    expect(component.state.ui.aiApplied).toBeTrue();
    expect(ui.showSuccess).toHaveBeenCalled();
  });

  it('sincroniza o builder real com aiLastSuggestion de WhatsApp + leads + remarketing antes de qualquer publish', () => {
    const consoleInfoSpy = spyOn(console, 'info');
    component.state.campaign.objective = 'OUTCOME_TRAFFIC';
    component.state.budget.value = 50;
    component.state.budget.quickBudget = 50;
    component.state.destination.type = 'site';
    component.state.destination.websiteUrl = '';
    component.state.creative.cta = 'LEARN_MORE';
    component.state.creative.message = '';
    component.state.creative.headline = '';
    component.state.creative.description = '';
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      status: 'AI_NEEDS_REVIEW',
      intent: {
        ...buildStructuredSuggestion().intent,
        objective: 'OUTCOME_LEADS',
        destinationType: 'messages',
        funnelStage: 'bottom',
        budgetAmount: 120,
        budgetType: 'daily',
        region: 'Brasil',
        segment: 'moda',
        cta: 'MESSAGE_PAGE',
        remarketingExpected: true,
      },
      campaign: {
        ...buildStructuredSuggestion().campaign,
        campaignName: 'Moda Brasil | WhatsApp',
        objective: 'OUTCOME_LEADS',
        budget: {
          type: 'daily',
          amount: 120,
          currency: 'BRL',
        },
      },
      adSet: {
        ...buildStructuredSuggestion().adSet,
        targeting: {
          ...buildStructuredSuggestion().adSet.targeting,
          country: 'BR',
          state: null,
          stateCode: null,
          city: null,
          interests: [],
          excludedInterests: [],
          placements: ['feed', 'stories'],
        },
      },
      creative: {
        ...buildStructuredSuggestion().creative,
        primaryText: 'Fale com a equipe no WhatsApp para recuperar o interesse na coleção.',
        headline: 'Fale com a equipe da loja',
        description: 'Atendimento rápido para leads em remarketing.',
        cta: 'MESSAGE_PAGE',
        destinationUrl: null,
      },
      validation: {
        ...buildStructuredSuggestion().validation,
        isReadyToPublish: false,
        blockingIssues: ['O briefing pede remarketing, mas ainda falta selecionar ou conectar um público de remarketing/pixel/audiência personalizada.'],
        warnings: ['Os interesses sugeridos vieram como público frio, então foram removidos do targeting final até existir uma audiência real de remarketing.'],
      },
      meta: {
        ...buildStructuredSuggestion().meta,
        consistencyApproved: false,
      },
    });

    component.applyCurrentAiSuggestion();

    expect(component.state.campaign.objective).toBe('OUTCOME_LEADS');
    expect(component.state.budget.value).toBe(120);
    expect(component.state.budget.budgetType).toBe('daily');
    expect(component.state.destination.type).toBe('messages');
    expect(component.state.destination.websiteUrl).toBe('');
    expect(component.state.creative.cta).toBe('MESSAGE_PAGE');
    expect(component.state.creative.message).toContain('WhatsApp');
    expect(component.state.creative.headline).toBe('Fale com a equipe da loja');
    expect(component.state.creative.description).toContain('remarketing');
    expect(component.state.placements.selected).toEqual(['feed', 'stories']);

    const payload = component.buildApiPayload();
    expect(payload.objective).toBe('OUTCOME_LEADS');
    expect(payload.dailyBudget).toBe(120);
    expect(payload.cta).toBe('MESSAGE_PAGE');
    expect(payload.destinationUrl).toBeUndefined();
    expect(payload.message).toContain('WhatsApp');
    expect(payload.headline).toBe('Fale com a equipe da loja');
    expect(payload.description).toContain('remarketing');

    component.state.ui.aiValidationStale = true;
    component.submit();

    expect(api.createMetaCampaign).not.toHaveBeenCalled();
    expect(ui.showWarning).toHaveBeenCalled();
    const latestWarning = ui.showWarning.calls.mostRecent().args.join(' ');
    expect(latestWarning).toContain('conversa');

    component.state.destination.type = 'site';
    component.state.destination.websiteUrl = 'https://metaiq.dev/oferta-moda';
    component.state.ui.aiValidationStale = true;
    component.submit();

    expect(api.createMetaCampaign).toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[CampaignBuilder] submit payload comparison',
      jasmine.objectContaining({
        aiLastSuggestion: jasmine.objectContaining({
          objective: 'OUTCOME_LEADS',
          budget: 120,
          destinationType: 'messages',
          cta: 'MESSAGE_PAGE',
        }),
        expandedState: jasmine.objectContaining({
          campaign: jasmine.objectContaining({ objective: 'OUTCOME_LEADS' }),
          budget: jasmine.objectContaining({ value: 120, budgetType: 'daily' }),
          destination: jasmine.objectContaining({ type: 'site' }),
          creative: jasmine.objectContaining({ cta: 'MESSAGE_PAGE' }),
        }),
        apiPayload: jasmine.objectContaining({
          objective: 'OUTCOME_LEADS',
          dailyBudget: 120,
          cta: 'MESSAGE_PAGE',
        }),
      }),
    );
  });

  it('persiste aiApplied e o payload aplicado ao salvar e restaurar o draft antes de publicar', () => {
    const draftKey = (component as any).draftStorageKey();
    localStorage.removeItem(draftKey);

    component.state.campaign.objective = 'OUTCOME_TRAFFIC';
    component.state.budget.value = 50;
    component.state.budget.quickBudget = 50;
    component.state.destination.type = 'site';
    component.state.creative.cta = 'LEARN_MORE';
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      status: 'AI_NEEDS_REVIEW',
      intent: {
        ...buildStructuredSuggestion().intent,
        objective: 'OUTCOME_LEADS',
        destinationType: 'messages',
        budgetAmount: 120,
        budgetType: 'daily',
        region: 'Brasil',
        segment: 'moda',
        cta: 'MESSAGE_PAGE',
        remarketingExpected: true,
      },
      campaign: {
        ...buildStructuredSuggestion().campaign,
        objective: 'OUTCOME_LEADS',
        budget: {
          type: 'daily',
          amount: 120,
          currency: 'BRL',
        },
      },
      creative: {
        ...buildStructuredSuggestion().creative,
        cta: 'MESSAGE_PAGE',
        destinationUrl: null,
      },
      validation: {
        ...buildStructuredSuggestion().validation,
        isReadyToPublish: false,
        blockingIssues: ['O briefing pede remarketing, mas ainda falta selecionar ou conectar um público de remarketing/pixel/audiência personalizada.'],
      },
      meta: {
        ...buildStructuredSuggestion().meta,
        consistencyApproved: false,
      },
    });

    component.applyCurrentAiSuggestion();
    expect(component.state.ui.aiApplied).toBeTrue();
    (component as any).persistDraft(false);

    fixture.destroy();

    const restoredFixture = TestBed.createComponent(CampaignCreatePanelComponent);
    const restoredComponent = restoredFixture.componentInstance;
    applyValidState(restoredComponent);
    restoredFixture.detectChanges();

    restoredComponent.restoreDraft();

    expect(restoredComponent.state.ui.aiApplied).toBeTrue();
    expect(restoredComponent.state.campaign.objective).toBe('OUTCOME_LEADS');
    expect(restoredComponent.state.budget.value).toBe(120);
    expect(restoredComponent.state.creative.cta).toBe('MESSAGE_PAGE');
    expect(restoredComponent.state.destination.type).toBe('messages');

    const restoredPayload = restoredComponent.buildApiPayload();
    expect(restoredPayload.objective).toBe('OUTCOME_LEADS');
    expect(restoredPayload.dailyBudget).toBe(120);
    expect(restoredPayload.cta).toBe('MESSAGE_PAGE');
    expect(restoredPayload.destinationUrl).toBeUndefined();
    expect(restoredPayload.objective).not.toBe('OUTCOME_TRAFFIC');
    expect(restoredPayload.dailyBudget).not.toBe(50);
    expect(restoredPayload.cta).not.toBe('LEARN_MORE');

    restoredComponent.submit();

    expect(api.createMetaCampaign).not.toHaveBeenCalled();
    expect(ui.showWarning).toHaveBeenCalled();

    localStorage.removeItem(draftKey);
  });

  it('bloqueia envio se o payload final divergir criticamente da sugestao aplicada da IA', () => {
    const consoleErrorSpy = spyOn(console, 'error');
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      status: 'AI_SUCCESS',
      intent: {
        ...buildStructuredSuggestion().intent,
        objective: 'OUTCOME_LEADS',
        destinationType: 'site',
        budgetAmount: 120,
        budgetType: 'daily',
        cta: 'MESSAGE_PAGE',
      },
      campaign: {
        ...buildStructuredSuggestion().campaign,
        objective: 'OUTCOME_LEADS',
        budget: {
          type: 'daily',
          amount: 120,
          currency: 'BRL',
        },
      },
      creative: {
        ...buildStructuredSuggestion().creative,
        cta: 'MESSAGE_PAGE',
        destinationUrl: 'https://metaiq.dev/oferta',
      },
      validation: {
        ...buildStructuredSuggestion().validation,
        isReadyToPublish: true,
        blockingIssues: [],
      },
      meta: {
        ...buildStructuredSuggestion().meta,
        consistencyApproved: true,
      },
    });

    component.applyCurrentAiSuggestion();
    component.state.campaign.objective = 'OUTCOME_TRAFFIC';
    component.state.budget.value = 50;
    component.state.budget.quickBudget = 50;
    component.state.creative.cta = 'LEARN_MORE';
    component.state.ui.aiValidationStale = false;

    component.submit();

    expect(api.createMetaCampaign).not.toHaveBeenCalled();
    expect(ui.showError).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    const divergentLog = consoleErrorSpy.calls.allArgs().find((args) => args[0] === '[CampaignBuilder] blocking divergent submit');
    expect(divergentLog).toBeTruthy();
    const details = divergentLog?.[1] as { issues?: string[] } | undefined;
    expect(details?.issues?.join(' ')).toContain('Objetivo esperado');
    expect(details?.issues?.join(' ')).toContain('Orçamento esperado');
    expect(details?.issues?.join(' ')).toContain('CTA esperado');
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
      intent: {
        ...buildStructuredSuggestion().intent,
        destinationType: 'site',
      },
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
    expect(text).toContain('Revis');
  });

  it('bloqueia envio quando existem blockingIssues da validacao da IA', () => {
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      intent: {
        ...buildStructuredSuggestion().intent,
        destinationType: 'site',
        budgetAmount: 120,
        cta: 'LEARN_MORE',
      },
      campaign: {
        ...buildStructuredSuggestion().campaign,
        budget: {
          type: 'daily',
          amount: 120,
          currency: 'BRL',
        },
      },
      creative: {
        ...buildStructuredSuggestion().creative,
        cta: 'LEARN_MORE',
        destinationUrl: 'https://metaiq.dev/oferta',
      },
      validation: {
        isReadyToPublish: false,
        qualityScore: 38,
        blockingIssues: ['A campanha precisa de uma destinationUrl válida em https.'],
        warnings: [],
        recommendations: ['Revise manualmente antes de enviar.'],
      },
    });
    component.state.ui.aiApplied = true;
    component.state.ui.aiValidationStale = false;

    component.submit();

    expect(api.createMetaCampaign).not.toHaveBeenCalled();
    expect(ui.showWarning).toHaveBeenCalledWith('Revisão obrigatória', 'Corrija os problemas obrigatórios antes de enviar a campanha.');
  });

  it('explica com clareza que campanhas de mensagens nao sao publicadas por este fluxo', () => {
    component.state.destination.type = 'messages';
    component.state.destination.websiteUrl = '';
    component.state.destination.messagesDestination = 'WhatsApp Business';
    component.state.tracking.pixel = '';
    component.state.ui.aiLastSuggestion = null;

    component.submit();

    expect(api.createMetaCampaign).not.toHaveBeenCalled();
    expect(ui.showWarning).toHaveBeenCalled();
    const [title, message] = ui.showWarning.calls.mostRecent().args;
    expect(title).toContain('Campanha');
    expect(message).toContain('Publicacao automatica');
    expect(message).toContain('conversa');
  });

  it('permite envio quando existem apenas warnings da validacao', () => {
    component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
      intent: {
        ...buildStructuredSuggestion().intent,
        destinationType: 'site',
        budgetAmount: 120,
        cta: 'LEARN_MORE',
      },
      campaign: {
        ...buildStructuredSuggestion().campaign,
        budget: {
          type: 'daily',
          amount: 120,
          currency: 'BRL',
        },
      },
      creative: {
        ...buildStructuredSuggestion().creative,
        cta: 'LEARN_MORE',
        destinationUrl: 'https://metaiq.dev/oferta',
      },
      validation: {
        isReadyToPublish: true,
        qualityScore: 71,
        blockingIssues: [],
        warnings: ['O CTA parece fraco para o objetivo escolhido.'],
        recommendations: ['Melhore a headline para destacar o benefício principal com mais clareza.'],
      },
    });
    component.state.ui.aiApplied = true;
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

    expect(fixture.nativeElement.textContent).toContain('Analisar campanha');

    component.reviewNow();
    fixture.detectChanges();

    const reviewSection = fixture.nativeElement.querySelector('#builder-review') as HTMLElement | null;

    expect(reviewSection?.textContent).toContain('Analisar campanha');
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

  it('prioriza o orçamento explícito do briefing ao montar a request da IA mesmo com builder em R$50', () => {
    component.state.budget.value = 50;
    component.state.ui.aiBudget = 50;
    component.state.ui.aiPrompt = 'Campanha de leads para ecommerce de moda no Brasil. Orçamento: R$ 120 por dia. CTA falar no WhatsApp.';

    component.applyAiSuggestions();

    const request = campaignAi.suggest.calls.mostRecent().args[0];
    expect(request.prompt).toContain('R$ 120 por dia');
    expect(request.budget).toBe(120);
  });

  it('renderiza a resposta do copiloto de campanha corretamente', () => {
    openAdvancedMode(component, fixture);
    component.analyzeCampaignWithAi();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(component.aiCopilotAnalysis()?.executiveDecision.decision).toBe('REVIEW');
    expect(component.executiveReviewAlert()).toContain('Esta campanha ainda nao esta segura para publicar.');
    expect(text).toContain('Analisar campanha');
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
  it('bloqueia o botao de usar sugestao quando usedFallback=true', () => {
  openAiResultMode(component, fixture);
  component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
    meta: {
      ...buildStructuredSuggestion().meta,
      usedFallback: true,
    },
  });
  fixture.detectChanges();

  const button = Array.from(
    fixture.nativeElement.querySelectorAll('.ai-result-actions .btn') as NodeListOf<HTMLButtonElement>,
  ).find((item) => item.textContent?.includes('Usar essa sugest'));

  expect(button?.disabled).toBeTrue();
  });

  it('bloqueia o botao de usar sugestao quando responseValid=false', () => {
  openAiResultMode(component, fixture);
  component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
    meta: {
      ...buildStructuredSuggestion().meta,
      responseValid: false,
    },
  });
  fixture.detectChanges();

  const button = Array.from(
    fixture.nativeElement.querySelectorAll('.ai-result-actions .btn') as NodeListOf<HTMLButtonElement>,
  ).find((item) => item.textContent?.includes('Usar essa sugest'));

  expect(button?.disabled).toBeTrue();
  });

  it('bloqueia o botao de usar sugestao quando a confidence cai para 32', () => {
  openAiResultMode(component, fixture);
  component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
    review: {
      ...buildStructuredSuggestion().review,
      confidence: 32,
    },
  });
  fixture.detectChanges();

  const button = Array.from(
    fixture.nativeElement.querySelectorAll('.ai-result-actions .btn') as NodeListOf<HTMLButtonElement>,
  ).find((item) => item.textContent?.includes('Usar essa sugest'));

  expect(button?.disabled).toBeTrue();
  });

  it('nao aplica sugestao quando o resultado marcado como AI_SUCCESS usou fallback', () => {
  component.state.campaign.name = '';
  component.state.ui.aiLastSuggestion = buildStructuredSuggestion({
    meta: {
      ...buildStructuredSuggestion().meta,
      usedFallback: true,
    },
  });

  component.applyCurrentAiSuggestion();

  expect(component.state.campaign.name).toBe('');
  expect(ui.showWarning).toHaveBeenCalled();
  const [title, message] = ui.showWarning.calls.mostRecent().args;
  expect(title).toContain('Sugest');
  expect(message).toContain('IA');
  expect(message).toContain('builder');
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
    status: overrides.status || 'AI_SUCCESS',
    intent: {
      objective: 'OUTCOME_LEADS',
      destinationType: 'messages',
      funnelStage: 'bottom',
      budgetAmount: 80,
      budgetType: 'daily',
      region: 'Curitiba, PR',
      segment: 'Pet shop',
      offer: 'Banho e tosa com agendamento',
      channel: 'whatsapp',
      cta: 'MESSAGE_PAGE',
      remarketingExpected: false,
      messageDestinationAvailable: true,
      websiteAvailable: true,
      metaConnected: true,
      pageConnected: true,
      whatsappAvailable: true,
      instagramAvailable: true,
      ...(overrides.intent || {}),
    },
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

function buildCopilotAnalysis(
  overrides: Partial<Omit<CampaignCopilotAnalysisResponse, 'analysis'>> & {
    analysis?: Partial<CampaignCopilotAnalysisResponse['analysis']>;
  } = {},
): CampaignCopilotAnalysisResponse {
  return {
    status: 'AI_SUCCESS',
    analysis: {
      overallScore: 78,
      riskLevel: 'MEDIUM',
      isReadyToPublish: false,
      businessDiagnosis: {
        summary: 'A campanha tem base válida, mas ainda pede ajustes antes da publicação.',
        mainProblem: 'Seu público está muito amplo para o orçamento definido.',
        mainOpportunity: 'Ajustar CTA e segmentação para ganhar eficiência.',
      },
      blockingIssues: [],
      warnings: ['Seu público está muito amplo para o orçamento definido.'],
      recommendations: ['Troque o CTA para um próximo passo mais claro.'],
      performanceAnalysis: {
        conversionPotential: 'Moderado, com dependência de ajuste fino em público e copy.',
        financialRisk: 'Moderado por risco de dispersão de verba.',
        metaApprovalRisk: 'Baixo com a copy atual.',
        scalabilityPotential: 'Moderado após validação inicial.',
      },
      executiveDecision: {
        decision: 'REVIEW',
        reason: 'A campanha ainda precisa de revisão antes da publicação.',
      },
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

