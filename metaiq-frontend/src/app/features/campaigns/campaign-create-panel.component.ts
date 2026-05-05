import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, HostListener, Input, Output, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { environment } from '../../core/environment';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import {
  AdAccount,
  Asset,
  AiCampaignCopilotAnalysis,
  AiCampaignCopilotImprovement,
  AiCampaignCopilotImprovementType,
  AiCampaignObjective,
  AiFunnelStage,
  AiGender,
  AiPlacement,
  AiTargetingOutput,
  AiValidationOutput,
  CampaignCopilotAnalysisRequest,
  CampaignAiFailureResponse,
  CampaignAiStructuredResponse,
  CampaignCopilotAnalysisResponse,
  CampaignSuggestionRequest,
  CampaignSuggestionResponse,
  CreateMetaCampaignRequest,
  CreateMetaCampaignResponse,
  IbgeCity,
  IbgeState,
  IntegrationProvider,
  IntegrationStatus,
  MetaCampaignCreationError,
  MetaCampaignErrorDetails,
  MetaCampaignExecutionStatus,
  MetaCampaignExecutionStep,
  MetaCampaignPartialIds,
  MetaCampaignRecoveryResponse,
  StoreIntegration,
} from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AccountContextService } from '../../core/services/account-context.service';
import { CompanyProfileService } from '../../core/services/company-profile.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';
import { CampaignAiService } from './campaign-ai.service';
import {
  defaultEventForObjective,
  normalizePromptText,
} from './campaign-builder-prompt.util';
import { buildInitialCampaignBuilderState } from './campaign-builder.initial-state';
import {
  aiSectionComplete,
  audienceSummary,
  blockerMessage,
  buildApiPayload,
  buildReviewSignals,
  buildSectionProgress,
  buildReadinessItems,
  buildSummaryRows,
  canSubmit,
  cloneCampaignBuilderState,
  creativeSectionComplete,
  destinationSectionComplete,
  destinationSummary,
  fieldInvalid,
  firstBlockingSectionId,
  generalSectionComplete,
  hasConfiguredPage,
  hasSyncedAdAccounts,
  identitySectionComplete,
  isIntegrationConnected,
  isLikelyDirectImageUrl,
  isSecureHttpUrl,
  isValidCountry,
  isValidHttpUrl,
  isValidImageUrl,
  placementSectionComplete,
  realPayloadComplete,
  scheduleSectionComplete,
  selectedAdAccountName,
  selectedObjectiveLabel,
  selectedPageName,
  trackingSectionComplete,
  trackingSummary,
  audienceSectionComplete,
  budgetSectionComplete,
  executivePublishBlockMessage,
  executivePublishState,
  META_MESSAGES_PUBLISH_SCOPE_MESSAGE,
  } from './campaign-builder-review.util';
import {
  CampaignBudgetType,
  CampaignBuilderState,
  CampaignCreationEntryMode,
  CampaignCreationMode,
  CampaignCreateSuccessEvent,
  CampaignDestinationType,
  CampaignGender,
  CampaignInitialStatus,
  CampaignModeSelection,
  CampaignBuilderUndoSnapshot,
  CampaignObjective,
  CampaignPlacement,
  CreationReadinessItem,
  ReviewSignal,
  SectionProgress,
  SuccessOverlayState,
  SummaryRow,
  WizardObjectiveId,
} from './campaign-builder.types';
import {
  CTA_OPTIONS,
  DEFAULT_CTA,
  getCtaLabelByValue,
  parseCtaValue,
  type MetaCallToActionType,
} from './cta.constants';
import { CreativePreviewComponent } from './creative-preview.component';
import { CampaignModeSelectorComponent } from './campaign-mode-selector.component';
import { ImageUploadComponent } from '../../shared/components/image-upload/image-upload.component';
// FASE 7.1: Step-by-step imports
import { CampaignBuilderStepperComponent, StepperItem } from './campaign-builder-stepper.component';
import {
  buildAllStepValidations,
  buildStepStateContext,
  buildStepProgressLabel,
} from './campaign-builder-step-state.util';
import {
  getStepSequence,
  getNextStep,
  getPreviousStep,
} from './campaign-builder-steps-validation.util';
import { StepId, StepValidation } from './campaign-builder.types';

@Component({
  selector: 'app-campaign-create-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, UiBadgeComponent, CreativePreviewComponent, CampaignBuilderStepperComponent, CampaignModeSelectorComponent, ImageUploadComponent],
  templateUrl: './campaign-create-panel.component.html',
  styleUrls: ['./campaign-create-panel.component.scss'],
})
export class CampaignCreatePanelComponent {
  private api = inject(ApiService);
  private campaignAiService = inject(CampaignAiService);
  private router = inject(Router);
  private ui = inject(UiService);
  private destroyRef = inject(DestroyRef);
  readonly accountContext = inject(AccountContextService);
  readonly companyProfile = inject(CompanyProfileService);
  readonly storeContext = inject(StoreContextService);

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<CampaignCreateSuccessEvent>();
  @Input() set initialMode(value: CampaignCreationEntryMode | '' | null | undefined) {
    this.applyEntryMode(value === 'ai' ? 'ai' : 'manual');
  }
  @Input() set resumeDraftOnOpen(value: boolean | '' | null | undefined) {
    this.pendingDraftRestore.set(!!value);
  }
  @Input() set initialTarget(value: 'configuration' | 'review' | '' | null | undefined) {
    this.pendingInitialTarget.set(value === 'review' ? 'review' : value === 'configuration' ? 'configuration' : null);
  }

  readonly objectiveOptions: Array<{ value: CampaignObjective; label: string; hint: string }> = [
    { value: 'OUTCOME_TRAFFIC', label: 'Tráfego', hint: 'Levar mais visitas para o destino escolhido.' },
    { value: 'OUTCOME_LEADS', label: 'Leads', hint: 'Capturar novos contatos com foco em intenção.' },
    { value: 'REACH', label: 'Alcance', hint: 'Maximizar cobertura com controle operacional simples.' },
  ];
  readonly ctaOptions = CTA_OPTIONS;
  readonly genderOptions: Array<{ value: CampaignGender; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'MALE', label: 'Masculino' },
    { value: 'FEMALE', label: 'Feminino' },
  ];
  readonly initialStatusOptions: Array<{ value: CampaignInitialStatus; label: string }> = [
    { value: 'PAUSED', label: 'Pausada' },
  ];
  readonly placementOptions: Array<{ value: CampaignPlacement; label: string; platform: string }> = [
    { value: 'feed', label: 'Feed', platform: 'Facebook / Instagram' },
    { value: 'stories', label: 'Stories', platform: 'Facebook / Instagram' },
    { value: 'reels', label: 'Reels', platform: 'Instagram / Facebook' },
    { value: 'explore', label: 'Explore', platform: 'Instagram' },
    { value: 'messenger', label: 'Messenger', platform: 'Messenger' },
    { value: 'audience_network', label: 'Audience Network', platform: 'Rede de audiência' },
  ];
  readonly destinationOptions: Array<{ value: CampaignDestinationType; label: string }> = [
    { value: 'site', label: 'Site' },
  ];
  readonly budgetTypeOptions: Array<{ value: CampaignBudgetType; label: string }> = [
    { value: 'daily', label: 'Diário' },
    { value: 'lifetime', label: 'Vitalício' },
  ];
  readonly weekDayOptions = [
    { value: 'Mon', label: 'Seg' },
    { value: 'Tue', label: 'Ter' },
    { value: 'Wed', label: 'Qua' },
    { value: 'Thu', label: 'Qui' },
    { value: 'Fri', label: 'Sex' },
    { value: 'Sat', label: 'Sáb' },
    { value: 'Sun', label: 'Dom' },
  ];
  readonly quickBudgetOptions = [50, 100, 150, 250, 500];
  readonly aiPromptPresets = [
    'Campanha de leads para ecommerce de moda no Brasil com orçamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
    'Campanha de tráfego para landing page de consultoria, público 25 a 45 anos, headline direta e imagem clean.',
    'Campanha de alcance para lançamento local, orçamento 80 por dia, criativo forte para stories e reels.',
  ];
  readonly aiFunnelStageOptions = [
    { value: '', label: 'Inferir pelo briefing' },
    { value: 'top', label: 'Topo de funil' },
    { value: 'middle', label: 'Meio de funil' },
    { value: 'bottom', label: 'Fundo de funil' },
    { value: 'remarketing', label: 'Remarketing' },
    { value: 'retention', label: 'Retenção' },
  ];
  readonly aiDestinationOptions = [
    { value: '', label: 'Inferir destino' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'website', label: 'Site/landing page' },
    { value: 'instagram', label: 'Instagram/Direct' },
    { value: 'leads', label: 'Formulário de leads' },
    { value: 'messages', label: 'Mensagens' },
  ];
  readonly flowSteps: Array<{ mode: CampaignCreationMode; label: string; hint: string; target: string }> = [
    { mode: 'ai-entry', label: 'Briefing IA', hint: 'Diga o que quer alcançar', target: 'builder-ai' },
    { mode: 'ai-result', label: 'Sugestão', hint: 'Revise antes de aplicar', target: 'builder-ai-result' },
    { mode: 'edit-lite', label: 'Ajuste rápido', hint: 'Refine o essencial', target: 'builder-lite' },
    { mode: 'advanced', label: 'Avançado', hint: 'Controle técnico completo', target: 'builder-advanced' },
  ];
  readonly sectionAnchors = [
    { id: 'builder-ai', label: 'IA por prompt' },
    { id: 'builder-general', label: 'Dados gerais' },
    { id: 'builder-identity', label: 'Conta e identidade' },
    { id: 'builder-audience', label: 'Público' },
    { id: 'builder-budget', label: 'Orçamento e lance' },
    { id: 'builder-schedule', label: 'Agenda' },
    { id: 'builder-placements', label: 'Posicionamentos' },
    { id: 'builder-destination', label: 'Destino' },
    { id: 'builder-creative', label: 'Criativo' },
    { id: 'builder-tracking', label: 'Rastreamento' },
    { id: 'builder-review', label: 'Revisão final' },
  ];

  readonly loadingContext = signal(false);
  readonly contextError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly recoverySubmitting = signal(false);
  readonly cleanupSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly submitFailure = signal<MetaCampaignCreationError | null>(null);
  readonly integration = signal<StoreIntegration | null>(null);
  readonly internalAdAccounts = signal<AdAccount[]>([]);
  readonly revision = signal(0);
  readonly submitAttempted = signal(false);
  readonly aiSuggesting = signal(false);
  readonly aiCopilotAnalyzing = signal(false);
  readonly draftRestored = signal(false);
  readonly draftAvailable = signal(false);
  readonly autosaveState = signal<'idle' | 'saving' | 'saved'>('idle');
  readonly lastSavedAt = signal<string | null>(null);
  readonly activeSection = signal('builder-ai');
  readonly creationMode = signal<CampaignCreationMode>('edit-lite');
  readonly creationEntryMode = signal<CampaignCreationEntryMode>('manual');
  readonly audienceAdvancedOpen = signal(false);
  readonly budgetAdvancedOpen = signal(false);
  readonly scheduleAdvancedOpen = signal(false);
  readonly placementAdvancedOpen = signal(false);
  readonly touchedFields = signal<Record<string, boolean>>({});
  readonly successOverlay = signal<SuccessOverlayState | null>(null);
  readonly closeConfirmOpen = signal(false);
  readonly technicalReviewOpen = signal(false);
  readonly technicalErrorOpen = signal(false);
  readonly detailedHelpEnabled = signal(false);
  readonly ibgeStates = signal<IbgeState[]>([]);
  readonly ibgeCities = signal<IbgeCity[]>([]);
  readonly loadingIbgeStates = signal(false);
  readonly loadingIbgeCities = signal(false);
  readonly ibgeError = signal<string | null>(null);
  readonly partialExecutionSignature = signal<string | null>(null);
  readonly aiExplanationOpen = signal(false);
  readonly modeSelection = computed(() => this.state.ui.modeSelection);
  readonly wizardObjectiveOptions: Array<{ id: WizardObjectiveId; label: string; hint: string }> = [
    { id: 'drive-site', label: 'Levar para o site', hint: 'Foco em tráfego qualificado.' },
    { id: 'receive-messages', label: 'Receber mensagens', hint: 'Abrir conversas com clientes.' },
    { id: 'sell-more', label: 'Vender mais', hint: 'Mensagem com intenção comercial.' },
    { id: 'promote-offer', label: 'Promover oferta', hint: 'Campanha de alcance e promoção.' },
  ];
  readonly selectedCreativeAssetMeta = signal<Asset | null>(null);

  // FASE 7.1: Step-by-step signals
  readonly stepFlowEnabled = signal(false); // Ativar com flag para não quebrar fluxo existente
  readonly currentStep = signal<StepId>('configuration');
  readonly stepValidations = signal<Record<StepId, StepValidation>>({
    'briefing-ia': { errors: [], warnings: [], isComplete: false },
    'configuration': { errors: [], warnings: [], isComplete: false },
    'audience': { errors: [], warnings: [], isComplete: false },
    'creative': { errors: [], warnings: [], isComplete: false },
    'review': { errors: [], warnings: [], isComplete: false },
  });
  readonly stepperItems = computed(() => {
    const sequence = getStepSequence(this.creationEntryMode() === 'ai');
    const items: StepperItem[] = [];

    for (const stepId of sequence) {
      const validation = this.stepValidations()[stepId];
      const currentIndex = sequence.indexOf(this.currentStep());
      const stepIndex = sequence.indexOf(stepId);

      let status: 'pending' | 'current' | 'completed' | 'error' = 'pending';
      if (stepId === this.currentStep()) {
        status = 'current';
      } else if (stepIndex < currentIndex) {
        status = validation && validation.isComplete ? 'completed' : 'error';
      } else if (validation && validation.errors.length > 0) {
        status = 'error';
      }

      const labelMap: Record<StepId, string> = {
        'briefing-ia': 'Briefing IA',
        'configuration': 'Configuracao',
        'audience': 'Público',
        'creative': 'Criativo',
        'review': 'Revisão',
      };

      items.push({
        id: stepId,
        label: labelMap[stepId],
        status,
        order: stepIndex,
      });
    }

    return items;
  });

  readonly stepProgressLabel = computed(() => {
    const sequence = getStepSequence(this.creationEntryMode() === 'ai');
    const index = sequence.indexOf(this.currentStep());
    return `Etapa ${index + 1} de ${sequence.length}`;
  });

  readonly canAdvanceCurrentStep = computed(() => {
    const validation = this.stepValidations()[this.currentStep()];
    return validation && validation.isComplete;
  });

  state: CampaignBuilderState = this.buildInitialState();
  private readonly initialState = this.buildInitialState();

  private contextRequestId = 0;
  private autosaveTimer: number | null = null;
  private saveIndicatorTimer: number | null = null;
  private pendingCreatedEvent: CampaignCreateSuccessEvent | null = null;
  private ibgeCitiesRequestUf = '';
  private pendingDraftRestore = signal(false);
  private pendingInitialTarget = signal<'configuration' | 'review' | null>(null);

  readonly sectionProgress = computed<SectionProgress[]>(() => {
    this.revision();
    return buildSectionProgress(this.reviewContext());
  });

  readonly progressPercent = computed(() => {
    const sections = this.sectionProgress();
    const completed = sections.filter((item) => item.done).length;
    return Math.round((completed / sections.length) * 100);
  });

  readonly readinessItems = computed<CreationReadinessItem[]>(() => {
    this.revision();
    return buildReadinessItems(this.reviewContext());
  });

  readonly summaryRows = computed<SummaryRow[]>(() => {
    this.revision();
    return buildSummaryRows(this.reviewContext(), (value) => this.formatCurrency(value));
  });

  readonly reviewSignals = computed<ReviewSignal[]>(() => {
    this.revision();
    return buildReviewSignals(this.state);
  });

  readonly builderScoreCards = computed(() => {
    this.revision();
    const readinessPercent = this.progressPercent();
    const issues = this.requiredIssueLabels();
    const qualityScore = this.qualityScoreValue();
    const completedSections = this.completedSectionsCount();
    const totalSections = this.totalSectionsCount();
    const currentStage = totalSections === 0 ? 0 : Math.min(completedSections + (completedSections === totalSections ? 0 : 1), totalSections);
    const qualityAvailable = this.hasAiQualitySignal();

    return [
      {
        id: 'readiness',
        title: 'Prontidão da campanha',
        value: `${readinessPercent}%`,
        meta: `Prontidão: ${readinessPercent}%`,
        detail: issues.length
          ? `Faltam ${issues.length} itens obrigatórios${this.formatIssueHint(issues)}`
          : 'Todos os itens obrigatórios foram preenchidos.',
        percent: readinessPercent,
        tone: this.scoreTone(readinessPercent),
        status: this.scoreStatusLabel(readinessPercent),
      },
      {
        id: 'quality',
        title: 'Qualidade IA',
        value: qualityAvailable ? `${qualityScore}/100` : '--',
        meta: qualityAvailable ? `Qualidade IA: ${qualityScore}/100` : 'Qualidade IA pendente',
        detail: this.qualityScoreDetail(),
        percent: qualityAvailable ? qualityScore : 0,
        tone: qualityAvailable ? this.scoreTone(qualityScore) : 'warning',
        status: this.qualityScoreStatus(),
      },
      {
        id: 'progress',
        title: 'Progresso das etapas',
        value: `${completedSections}/${totalSections}`,
        meta: `Etapa ${currentStage} de ${totalSections}`,
        detail: this.progressDetail(),
        percent: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
        tone: this.scoreTone(totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0),
        status: this.completedSectionsStatus(completedSections, totalSections),
      },
    ];
  });

  readonly reviewJson = computed(() => {
    this.revision();
    return JSON.stringify(
      {
        apiPayload: this.buildApiPayload(),
        operationalPreview: this.publishPreview(),
      },
      null,
      2,
    );
  });

  readonly nextPendingSection = computed(() => {
    const pending = this.sectionProgress().find((section) => !section.done && section.id !== 'builder-review');
    return pending || this.sectionAnchors[this.sectionAnchors.length - 1];
  });

  readonly autosaveLabel = computed(() => {
    const state = this.autosaveState();
    if (state === 'saving') return 'Salvando rascunho...';
    if (state === 'saved') return this.lastSavedAt() ? `Rascunho salvo às ${this.lastSavedAt()}` : 'Rascunho salvo';
    return this.draftAvailable() ? 'Rascunho disponível' : 'Sem rascunho salvo';
  });

  readonly aiDetectedFieldsPreview = computed(() => this.state.ui.aiDetectedFields.slice(0, 8));
  readonly partialExecutionDirty = computed(() => {
    this.revision();
    const signature = this.partialExecutionSignature();
    const failure = this.submitFailure();
    if (!signature || failure?.executionStatus !== 'PARTIAL') {
      return false;
    }

    return this.currentPayloadSignature() !== signature;
  });
  readonly normalSubmitBlocked = computed(() => {
    const failure = this.submitFailure();
    return failure?.executionStatus === 'PARTIAL' && !this.partialExecutionDirty();
  });
  readonly canContinuePartialCreation = computed(() => {
    const failure = this.submitFailure();
    return !!failure?.executionId
      && failure.executionStatus === 'PARTIAL'
      && !this.partialExecutionDirty()
      && !this.submitting()
      && !this.recoverySubmitting();
  });

  constructor() {
    this.applyEntryMode('manual');
    this.loadIbgeStates();

    if (!this.storeContext.loaded()) {
      this.storeContext.load();
    }

    this.destroyRef.onDestroy(() => {
      if (this.autosaveTimer) window.clearTimeout(this.autosaveTimer);
      if (this.saveIndicatorTimer) window.clearTimeout(this.saveIndicatorTimer);
    });

    effect(
      () => {
        if (!this.storeContext.loaded()) return;

        const requestedStoreId = this.storeContext.selectedStoreId();
        const validStoreId = this.storeContext.getValidSelectedStoreId();

        this.integration.set(null);
        this.internalAdAccounts.set([]);
        this.contextError.set(null);
        this.submitError.set(null);
        this.submitFailure.set(null);
        this.partialExecutionSignature.set(null);
        this.technicalErrorOpen.set(false);
        this.state.identity.facebookPageId = '';

        if (requestedStoreId && !validStoreId) {
          this.state.identity.adAccountId = '';
          this.applyIndividualBusinessDefaults();
          this.touchState();
          this.contextError.set(
            this.accountContext.isIndividualAccount()
              ? 'A empresa ativa nao pertence ao usuario atual.'
              : 'A store selecionada nao pertence ao usuario atual.',
          );
          return;
        }

        if (!validStoreId) {
          this.state.identity.adAccountId = '';
          this.applyIndividualBusinessDefaults();
          this.touchState();
          this.syncDraftAvailability();
          return;
        }

        this.applyIndividualBusinessDefaults();
        this.syncDraftAvailability();
        this.loadCreationContext(validStoreId);
      },
    );

    effect(() => {
      this.storeContext.loaded();
      this.draftAvailable();
      this.pendingDraftRestore();
      this.pendingInitialTarget();
      queueMicrotask(() => this.applyPendingLaunchIntent());
    });
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.successOverlay()) return;
    if (this.closeConfirmOpen()) {
      this.closeConfirmOpen.set(false);
      return;
    }
    this.requestClosePanel();
  }

  requestClosePanel(): void {
    if (this.hasMeaningfulInput()) {
      this.closeConfirmOpen.set(true);
      return;
    }

    this.closePanel();
  }

  keepEditing(): void {
    this.closeConfirmOpen.set(false);
  }

  saveDraftAndClose(): void {
    this.persistDraft(false);
    this.closeConfirmOpen.set(false);
    this.closePanel();
  }

  discardAndClose(): void {
    this.closeConfirmOpen.set(false);
    this.closePanel();
  }

  closePanel(): void {
    this.close.emit();
  }

  touchState(markAiValidationStale = true): void {
    if (markAiValidationStale && this.state.ui.aiLastSuggestion) {
      this.state.ui.aiValidationStale = true;
    }
    if (markAiValidationStale && this.state.ui.aiCopilotAnalysis) {
      this.state.ui.aiCopilotStale = true;
    }
    this.revision.update((value) => value + 1);
    this.scheduleAutosave();

    // FASE 7.1: Atualizar validações de steps quando estado muda
    if (this.stepFlowEnabled()) {
      this.updateAllStepValidations();
    }
  }

  // FASE 7.1: Step Navigation Methods

  /**
   * Atualiza validações para todas as etapas
   */
  private updateAllStepValidations(): void {
    const context = this.reviewContext();
    const validations = buildAllStepValidations(this.state, context, this.creationEntryMode() === 'ai');
    this.stepValidations.set(validations);
  }

  /**
   * Avança para o próximo step se a validação passar
   */
  advanceStep(): void {
    if (!this.canAdvanceCurrentStep()) {
      return;
    }

    const nextStep = getNextStep(this.currentStep(), this.creationEntryMode() === 'ai');
    if (nextStep) {
      this.currentStep.set(nextStep);
      this.scrollToTopOfPanel();
    }
  }

  /**
   * Volta para o step anterior
   */
  regressStep(): void {
    const previousStep = getPreviousStep(this.currentStep(), this.creationEntryMode() === 'ai');
    if (previousStep) {
      this.currentStep.set(previousStep);
      this.scrollToTopOfPanel();
    }
  }

  /**
   * Pula para um step específico (apenas se for anterior)
   */
  jumpToStep(targetStep: StepId): void {
    const sequence = getStepSequence(this.creationEntryMode() === 'ai');
    const currentIndex = sequence.indexOf(this.currentStep());
    const targetIndex = sequence.indexOf(targetStep);

    if (targetIndex <= currentIndex) {
      this.currentStep.set(targetStep);
      this.scrollToTopOfPanel();
    }
  }

  /**
   * Inicializa o fluxo step-by-step
   */
  enableStepFlow(): void {
    this.stepFlowEnabled.set(true);
    const entryMode = this.creationEntryMode();
    const startStep: StepId = entryMode === 'ai' ? 'briefing-ia' : 'configuration';
    this.currentStep.set(startStep);
    this.updateAllStepValidations();
  }

  /**
   * Desabilita o fluxo step-by-step (volta para visão anterior)
   */
  disableStepFlow(): void {
    this.stepFlowEnabled.set(false);
  }

  /**
   * Retorna a validação da etapa atual
   */
  getCurrentStepValidation(): StepValidation | null {
    return this.stepValidations()[this.currentStep()] || null;
  }

  /**
   * Scroll até o topo do painel (para renderizar nova seção)
   */
  private scrollToTopOfPanel(): void {
    window.setTimeout(() => {
      const panel = document.querySelector('.create-panel');
      if (panel) {
        panel.scrollTop = 0;
      }
    }, 0);
  }

  selectStore(storeId: string): void {
    this.storeContext.select(storeId);
  }

  goToIntegrations(): void {
    const storeId = this.storeContext.getValidSelectedStoreId() || this.storeContext.selectedStoreId() || null;
    this.router.navigate(['/manager/integrations'], {
      queryParams: storeId ? { storeId } : undefined,
    });
  }

  selectObjective(value: CampaignObjective): void {
    this.state.campaign.objective = value;
    this.touchState();
  }

  setInitialStatus(_value: CampaignInitialStatus): void {
    this.state.campaign.initialStatus = 'PAUSED';
    this.touchState();
  }

  setBudgetChip(value: number): void {
    this.state.budget.value = value;
    this.state.budget.quickBudget = value;
    this.touchState();
  }

  setDestinationType(value: CampaignDestinationType): void {
    this.state.destination.type = value === 'site' ? 'site' : 'site';
    this.touchState();
  }

  setGender(value: CampaignGender): void {
    this.state.audience.gender = value;
    this.touchState();
  }

  setCountry(value: string): void {
    this.state.audience.country = (value || '').toUpperCase();
    if (this.state.audience.country !== 'BR') {
      this.clearAiGeoPendingNotice();
    }
    this.touchState();
  }

  selectAudienceState(value: string): void {
    const stateOption = this.ibgeStates().find((item) => item.code === value) || null;
    this.state.audience.state = stateOption?.code || '';
    this.state.audience.stateName = stateOption?.name || '';
    this.state.audience.region = stateOption?.name || '';
    this.state.audience.city = '';
    this.state.audience.cityId = null;
    this.ibgeCities.set([]);
    this.ibgeError.set(null);

    if (stateOption) {
      this.loadIbgeCities(stateOption.code);
    }

    this.refreshAiGeoPendingNotice();
    this.touchState();
  }

  selectAudienceCity(value: string): void {
    const cityId = Number(value);
    const cityOption = this.ibgeCities().find((item) => item.id === cityId) || null;
    this.state.audience.city = cityOption?.name || '';
    this.state.audience.cityId = cityOption?.id || null;
    this.refreshAiGeoPendingNotice();
    this.touchState();
  }

  togglePlacement(placement: CampaignPlacement, enabled: boolean): void {
    const current = new Set(this.state.placements.selected);
    if (enabled) {
      current.add(placement);
    } else {
      current.delete(placement);
    }
    this.state.placements.selected = Array.from(current);
    this.touchState();
  }

  isPlacementSelected(placement: CampaignPlacement): boolean {
    return this.state.placements.selected.includes(placement);
  }

  toggleWeekDay(day: string, enabled: boolean): void {
    const current = new Set(this.state.schedule.weekDays);
    if (enabled) {
      current.add(day);
    } else {
      current.delete(day);
    }
    this.state.schedule.weekDays = Array.from(current);
    this.touchState();
  }

  isWeekDaySelected(day: string): boolean {
    return this.state.schedule.weekDays.includes(day);
  }

  focusAiSection(): void {
    this.switchToAiMode();
  }

  clearAiPrompt(): void {
    this.state.ui.aiPrompt = '';
    this.state.ui.aiGoal = '';
    this.state.ui.aiFunnelStage = '';
    this.state.ui.aiBudget = null;
    this.state.ui.aiDurationDays = null;
    this.state.ui.aiDestinationType = '';
    this.state.ui.aiPrimaryOffer = '';
    this.state.ui.aiRegion = '';
    this.state.ui.aiExtraContext = '';
    this.state.ui.aiApplied = false;
    this.state.ui.aiDetectedFields = [];
    this.state.ui.aiLastSummary = '';
    this.state.ui.aiCreativeIdeas = [];
    this.state.ui.aiConfidence = null;
    this.state.ui.aiStrengths = [];
    this.state.ui.aiAssumptions = [];
    this.state.ui.aiMissingInputs = [];
    this.state.ui.aiRiskWarnings = [];
    this.state.ui.aiRecommendations = [];
    this.state.ui.aiValidationReady = null;
    this.state.ui.aiQualityScore = null;
    this.state.ui.aiBlockingIssues = [];
    this.state.ui.aiValidationWarnings = [];
    this.state.ui.aiValidationRecommendations = [];
    this.state.ui.aiValidationStale = false;
    this.state.ui.aiGeoPendingNotice = null;
    this.state.ui.aiIgnoredFields = [];
    this.state.ui.aiUsedFallback = false;
    this.state.ui.aiLastSuggestion = null;
    this.setCreationMode(this.creationEntryMode() === 'ai' ? 'ai-entry' : 'edit-lite', false);
    this.touchState(false);
  }

  applyPromptPreset(prompt: string): void {
    this.state.ui.aiPrompt = prompt;
    this.touchState();
  }

  showModeSelector(): boolean {
    return false;
  }

  selectMode(mode: CampaignModeSelection): void {
    this.state.ui.modeSelection = mode;

    if (mode === 'AI') {
      this.disableStepFlow();
      this.switchToAiMode();
      this.setCreationMode('ai-entry');
      return;
    }

    this.switchToManualMode();
    if (mode === 'GUIDED') {
      this.enableStepFlow();
      this.setCreationMode('edit-lite');
      return;
    }

    this.disableStepFlow();
    this.setCreationMode('advanced');
  }

  resetMode(): void {
    this.selectMode('AI');
  }

  stepIsCurrent(stepId: StepId | 'objective' | 'product' | 'budget'): boolean {
    const aliasMap: Record<'objective' | 'product' | 'budget', StepId> = {
      objective: 'configuration',
      product: 'configuration',
      budget: 'configuration',
    };
    const normalizedStep = stepId in aliasMap
      ? aliasMap[stepId as keyof typeof aliasMap]
      : stepId as StepId;
    return this.currentStep() === normalizedStep;
  }

  isFirstWizardStep(): boolean {
    const sequence = getStepSequence(this.creationEntryMode() === 'ai');
    return this.currentStep() === sequence[0];
  }

  selectWizardObjective(objectiveId: WizardObjectiveId): void {
    this.state.ui.simpleObjective = objectiveId;
    this.state.campaign.objective = this.mapWizardObjectiveToCampaignObjective(objectiveId);
    this.touchState();
  }

  syncProductDetails(): void {
    if (!this.state.campaign.name.trim() && this.state.ui.productName.trim()) {
      this.state.campaign.name = this.state.ui.productName.trim();
    }
    if (!this.state.creative.headline.trim() && this.state.ui.productName.trim()) {
      this.state.creative.headline = this.state.ui.productName.trim().slice(0, 80);
    }
    this.touchState();
  }

  retryAiSuggestion(): void {
    this.applyAiSuggestions();
  }

  onAiBriefingSubmit(prompt: string): void {
    this.state.ui.aiPrompt = (prompt || '').trim();
    this.applyAiSuggestions();
  }

  toggleAiExplanation(): void {
    this.aiExplanationOpen.update((value) => !value);
  }

  hasAiExplanationPanel(): boolean {
    return !!this.state.ui.aiLastSuggestion;
  }

  hasPendingAiDraftApplication(): boolean {
    return !!this.state.ui.aiLastSuggestion && !this.state.ui.aiApplied;
  }

  aiStrategyText(): string {
    return this.state.ui.aiLastSuggestion?.strategy
      || selectedObjectiveLabel(this.objectiveOptions, this.state.campaign.objective)
      || 'Estratégia em revisão';
  }

  aiExplanationText(section: 'strategy' | 'audience' | 'copy' | 'budget'): string {
    return this.state.ui.aiLastSuggestion?.explanation?.[section] || 'A IA ainda não gerou explicação para este bloco.';
  }

  aiSuggestedAudienceLabel(): string {
    const audience = this.state.ui.aiLastSuggestion?.audience;
    if (!audience) {
      return 'Público em revisão';
    }

    return audience.ageRange || audience.gender || 'Público sugerido';
  }

  aiSuggestionReasoning(): string[] {
    return this.state.ui.aiLastSuggestion?.reasoning || [];
  }

  aiSuggestionImprovements(): string[] {
    return this.state.ui.aiLastSuggestion?.improvements || [];
  }

  aiSuggestionRisks(): string[] {
    return this.state.ui.aiLastSuggestion?.risks || [];
  }

  canUseAiInCurrentWizardStep(): boolean {
    return this.currentStep() !== 'review';
  }

  generateWizardWithAi(): void {
    this.applyAiSuggestions();
  }

  budgetProjectionLabel(): string {
    const budget = Number(this.state.budget.value) || 0;
    if (budget <= 0) {
      return 'Defina um orçamento para ver a projeção.';
    }
    return `Estimativa rápida para ${Math.max(1, Math.round(budget / 10))} mil impressões por dia.`;
  }

  applyBudgetPreset(value: number): void {
    this.setBudgetChip(value);
  }

  selectedWizardObjectiveLabel(): string {
    return this.wizardObjectiveOptions.find((item) => item.id === this.state.ui.simpleObjective)?.label || 'Objetivo';
  }

  wizardReviewChecklist(): Array<{ label: string; done: boolean }> {
    return [
      { label: 'Objetivo definido', done: !!this.state.ui.simpleObjective },
      { label: 'Produto descrito', done: !!this.state.ui.productName.trim() && !!this.state.ui.productDescription.trim() },
      { label: 'Público configurado', done: !!this.state.audience.country.trim() },
      { label: 'Criativo preenchido', done: !!this.state.creative.message.trim() && !!this.state.creative.headline.trim() },
      { label: 'Orçamento válido', done: Number(this.state.budget.value) > 0 },
    ];
  }

  applyAiSuggestions(): void {
    const prompt = this.state.ui.aiPrompt.trim();
    if (!prompt) {
      this.ui.showWarning('Descrição vazia', 'Descreva rapidamente a campanha para gerar com IA.');
      return;
    }

    const storeId = this.storeContext.getValidSelectedStoreId();
    if (!storeId) {
      this.ui.showWarning('Store obrigatória', 'Selecione uma store válida antes de gerar com IA.');
      return;
    }

    this.state.ui.aiFailure = null;
    this.aiSuggesting.set(true);

    this.campaignAiService.suggest(this.buildAiSuggestionRequest(prompt, storeId))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.aiSuggesting.set(false);
          if (this.isAiFailureResponse(result)) {
            this.state.ui.aiFailure = result;
            this.state.ui.aiLastSuggestion = null;
            this.state.ui.aiCreativeIdeas = [];
            this.state.ui.aiUsedFallback = !!result.meta?.usedFallback;
            this.touchState(false);
            this.ui.showWarning(
              'Sugestão indisponível no momento',
              result.message || 'Não foi possível gerar uma sugestão estruturada agora. Continue no fluxo manual.',
            );
            return;
          }

          if (result.status !== 'AI_SUCCESS' && result.status !== 'AI_NEEDS_REVIEW') {
            this.state.ui.aiFailure = {
              status: 'AI_NEEDS_RETRY',
              reason: 'invalid_response',
              message: 'A sugestão da IA não passou na validação de consistência. Gere novamente antes de aplicar.',
              meta: result.meta,
            };
            this.state.ui.aiLastSuggestion = result;
            this.applyAiTrustMetadata(result);
            this.touchState(false);
            this.ui.showWarning(
              'Sugestão bloqueada',
              this.state.ui.aiFailure.message,
            );
            this.scrollToSection('builder-ai-result');
            return;
          }

          this.state.ui.aiFailure = null;
          this.state.ui.aiLastSuggestion = result;
          this.state.ui.aiCreativeIdeas = result.creative.imageSuggestion ? [result.creative.imageSuggestion] : [];
          this.applyAiTrustMetadata(result);
          this.state.ui.aiDetectedFields = this.buildAiDetectedFields(result);
          this.state.ui.aiLastSummary = result.review.summary || 'Sugestão de campanha gerada pela IA.';
          this.state.ui.aiApplied = false;
          this.state.ui.builderMode = 'ai';
          this.creationEntryMode.set('ai');
          this.setCreationMode('ai-result', false);
          this.touchState(false);
          if (result.meta?.usedFallback) {
            this.ui.showWarning(
              'Sugestão segura pronta',
              'IA gerou resposta incompleta. Usando sugestão segura.',
            );
          } else {
            this.ui.showSuccess(
              'Sugestão pronta para revisão',
              'A IA montou uma primeira versão. Revise antes de aplicar ao builder.',
            );
          }
          this.scrollToSection('builder-ai-result');
        },
        error: (error) => {
          this.aiSuggesting.set(false);
          this.state.ui.aiFailure = {
            status: 'AI_FAILED',
            reason: 'api_error',
            message: error?.message || 'Nao foi possivel gerar sugestoes agora. O builder avancado continua disponivel para criacao manual.',
            meta: {
              promptVersion: 'frontend-http-error',
              model: 'unavailable',
              usedFallback: false,
              responseValid: false,
            },
          };
          this.state.ui.aiCreativeIdeas = [];
          this.state.ui.aiConfidence = null;
          this.state.ui.aiStrengths = [];
          this.state.ui.aiAssumptions = [];
          this.state.ui.aiMissingInputs = [];
          this.state.ui.aiRiskWarnings = [];
          this.state.ui.aiRecommendations = [];
          this.state.ui.aiValidationReady = null;
          this.state.ui.aiQualityScore = null;
          this.state.ui.aiBlockingIssues = [];
          this.state.ui.aiValidationWarnings = [];
          this.state.ui.aiValidationRecommendations = [];
          this.state.ui.aiValidationStale = false;
          this.state.ui.aiIgnoredFields = [];
          this.state.ui.aiUsedFallback = false;
          this.state.ui.aiLastSuggestion = null;
          this.touchState(false);
          this.ui.showWarning(
            'IA indisponivel no momento',
            this.state.ui.aiFailure.message,
          );
        },
      });
  }

  analyzeCampaignWithAi(): void {
    const storeId = this.storeContext.getValidSelectedStoreId();
    if (!storeId) {
      this.ui.showWarning('Store obrigatória', 'Selecione uma store válida antes de analisar a campanha.');
      return;
    }

    this.aiCopilotAnalyzing.set(true);

    this.campaignAiService.analyze(this.buildCampaignCopilotRequest(storeId))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.aiCopilotAnalyzing.set(false);
          if (this.isAiFailureResponse(result)) {
            this.state.ui.aiCopilotFailure = result;
            this.state.ui.aiCopilotAnalysis = null;
            this.touchState(false);
            this.ui.showWarning(
              'Análise indisponível no momento',
              result.message || 'Não foi possível analisar a campanha agora. O fluxo manual continua disponível.',
            );
            return;
          }

          this.state.ui.aiCopilotFailure = null;
          this.state.ui.aiCopilotAnalysis = this.normalizeCopilotConfidence(result);
          this.state.ui.aiCopilotStale = false;
          this.state.ui.aiCopilotAppliedImprovementIds = [];
          this.state.ui.aiCopilotIgnoredImprovementIds = [];
          this.state.ui.aiCopilotLastAppliedMessage = null;
          this.state.ui.aiCopilotApplyError = null;
          this.state.ui.aiCopilotUndoSnapshot = null;
          this.touchState(false);
          this.ui.showSuccess(
            'Análise concluída',
            'A IA revisou a estrutura da campanha e destacou os ajustes mais relevantes antes da publicação.',
          );
        },
        error: (error) => {
          this.aiCopilotAnalyzing.set(false);
          this.ui.showWarning(
            'Análise indisponível no momento',
            error?.message || 'Não foi possível analisar a campanha agora. O fluxo manual continua disponível.',
          );
        },
      });
  }

  retryAiCopilotAnalysis(): void {
    this.analyzeCampaignWithAi();
  }

  clearCreativeAsset(): void {
    this.clearCreativeAssetSelection();
  }

  applyCurrentAiSuggestion(): void {
    const result = this.state.ui.aiLastSuggestion;
    const prompt = this.state.ui.aiPrompt.trim();
    if (!result) {
      this.ui.showWarning('Sem sugestão para aplicar', 'Gere uma sugestão com IA antes de preencher o builder.');
      this.switchToAiMode();
      return;
    }
    if ((result.status !== 'AI_SUCCESS' && result.status !== 'AI_NEEDS_REVIEW') || !this.canApplySuggestionToDraft(result)) {
      this.ui.showWarning(
        'Sugestão bloqueada',
        'A resposta da IA não passou nas validações mínimas. Gere novamente antes de aplicar ao builder.',
      );
      return;
    }

    const beforeSnapshot = this.buildApplyTriggerSnapshot();
    this.clearAiGeoPendingNotice();
    const { appliedCount, ignoredFields } = this.applyStructuredAiSuggestion(result);
    this.state.ui.aiCreativeIdeas = result.creative.imageSuggestion ? [result.creative.imageSuggestion] : [];
    this.applyAiTrustMetadata(result);
    this.state.ui.aiIgnoredFields = ignoredFields;
    this.state.ui.aiApplied = true;
    this.state.ui.aiValidationStale = false;
    this.setCreationMode('edit-lite', false);
    this.touchState(false);
    this.logCampaignApplyComparison(appliedCount, ignoredFields);
    this.ui.showSuccess(
      'Sugestão aplicada ao rascunho',
      appliedCount > 0
        ? `${appliedCount} campos foram preenchidos. Revise os bloqueios pendentes antes de criar na Meta.`
        : 'A sugestão foi mantida para revisão, sem sobrescrever campos já preenchidos.',
    );
    this.scrollToSection('builder-lite');
  }

  adjustSuggestionBeforeUse(): void {
    this.switchToAiMode();
  }

  openAdvancedBuilder(): void {
    this.setCreationMode('advanced');
  }

  openLiteEditor(): void {
    this.setCreationMode('edit-lite');
  }

  saveDraft(): void {
    this.persistDraft(false);
  }

  restoreDraft(): void {
    this.restoreDraftFromLocalStorage(true);
  }

  reviewNow(): void {
    if (this.creationMode() === 'ai-entry') {
      this.setCreationMode('edit-lite', false);
    }
    this.markReviewVisited();
    this.scrollToSection('builder-review');
  }

  switchToManualMode(): void {
    this.applyEntryMode('manual');
  }

  switchToAiMode(): void {
    this.applyEntryMode('ai');
  }

  goToNextPendingSection(): void {
    this.scrollToSection(this.nextPendingSection().id);
  }

  setCreationMode(mode: CampaignCreationMode, shouldTouch = true): void {
    this.creationMode.set(mode);
    this.state.ui.aiFlowMode = mode;
    this.state.ui.builderMode = mode === 'ai-entry' || mode === 'ai-result' ? 'ai' : this.creationEntryMode();
    if (shouldTouch) {
      this.touchState();
    }

    const target = this.flowSteps.find((step) => step.mode === mode)?.target;
    if (target) {
      this.activeSection.set(target);
      window.setTimeout(() => {
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  }

  flowStepTone(mode: CampaignCreationMode): 'success' | 'warning' | 'neutral' | 'info' {
    if (this.creationMode() === mode) return 'info';
    if (mode === 'ai-entry' && (this.state.ui.aiLastSuggestion || this.state.ui.aiApplied)) return 'success';
    if (mode === 'ai-result' && this.state.ui.aiLastSuggestion) return 'success';
    if (mode === 'edit-lite' && this.state.ui.aiApplied) return 'success';
    if (mode === 'advanced' && this.creationMode() === 'advanced') return 'success';
    return 'neutral';
  }

  visibleFlowSteps() {
    if (this.creationEntryMode() === 'manual') {
      return this.flowSteps.filter((step) => step.mode !== 'ai-entry' && step.mode !== 'ai-result');
    }
    return this.flowSteps;
  }

  builderModeLabel(): string {
    return this.creationEntryMode() === 'ai' ? 'Assistido por IA' : 'Manual';
  }

  builderModeIndicator(): string {
    return `Modo: ${this.creationEntryMode() === 'ai' ? 'IA' : 'Manual'}`;
  }

  panelTitle(): string {
    return 'Criar campanha';
  }

  assistantCtaLabel(): string {
    return 'Sugerir com IA';
  }

  shouldShowAiEntry(): boolean {
    return this.creationMode() === 'ai-entry';
  }

  shouldShowStatusBlock(): boolean {
    return this.creationMode() !== 'ai-entry' || this.creationEntryMode() === 'manual';
  }

  showPreviewSidebar(): boolean {
    return this.creationMode() !== 'ai-entry' && this.creationMode() !== 'ai-result';
  }

  showCreateButtonInReview(): boolean {
    return this.creationMode() === 'advanced' || this.activeSection() === 'builder-review';
  }

  campaignProblems(): string[] {
    const problems = new Set<string>();

    if (this.contextError()) {
      problems.add(this.contextError() || '');
    }

    if (!this.state.campaign.name.trim()) {
      problems.add('Informe o nome da campanha.');
    }

    if (!this.state.identity.adAccountId.trim()) {
      problems.add('Selecione uma conta de anúncio.');
    }

    if (this.hasMissingConfiguredPage()) {
      problems.add('Configure a página da loja antes de publicar.');
    }

    if (!(Number(this.state.budget.value) > 0)) {
      problems.add('Informe um orçamento maior que zero.');
    }

    if (!this.isValidCountry(this.state.audience.country)) {
      problems.add('Selecione um país válido.');
    }

    if (this.state.audience.country.trim().toUpperCase() === 'BR' && this.state.audience.city.trim() && !this.state.audience.state.trim()) {
      problems.add('Selecione a UF para validar a localização da campanha.');
    }

    if (this.state.ui.aiGeoPendingNotice) {
      problems.add(this.state.ui.aiGeoPendingNotice);
    }

    if (!['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'REACH'].includes(this.state.campaign.objective)) {
      problems.add('Este objetivo ainda não está disponível para publicação segura.');
    }

    if (!this.state.destination.websiteUrl.trim()) {
      problems.add('Informe a URL de destino da campanha.');
    } else if (!isSecureHttpUrl(this.state.destination.websiteUrl)) {
      problems.add('Use uma URL segura começando com https://.');
    }

    if (!this.state.creative.message.trim()) {
      problems.add('Preencha a mensagem principal do anúncio.');
    }

    if (!this.state.creative.headline.trim()) {
      problems.add('Preencha a headline do anúncio.');
    }

    if (!this.state.creative.imageAssetId.trim()) {
      problems.add('Envie uma imagem válida para o criativo.');
    }

    if (!this.state.placements.selected.length) {
      problems.add('Selecione pelo menos um posicionamento antes de publicar.');
    }

    if (!this.state.tracking.mainEvent.trim()) {
      problems.add('Defina o evento principal de rastreamento.');
    }

    if (this.state.campaign.objective === 'OUTCOME_LEADS' && !this.state.tracking.pixel.trim()) {
      problems.add('Campanhas de leads exigem pixel configurado antes da publicação.');
    }

    for (const issue of this.aiValidation()?.blockingIssues || []) {
      if (issue.trim()) {
        problems.add(issue.trim());
      }
    }

    if (this.submitError()) {
      problems.add(this.submitError() || '');
    }

    if (this.submitFailure()?.message) {
      problems.add(this.submitFailure()?.message || '');
    }

    return Array.from(problems).filter(Boolean);
  }

  hasCampaignProblems(): boolean {
    return this.campaignProblems().length > 0;
  }

  campaignWarnings(): string[] {
    const warnings = new Set<string>();

    for (const item of this.aiValidation()?.warnings || []) {
      if (item.trim()) {
        warnings.add(item.trim());
      }
    }

    if (this.state.ui.aiValidationStale) {
      warnings.add('A validação da IA pode não refletir as alterações recentes.');
    }

    if (this.state.campaign.objective !== 'OUTCOME_LEADS' && !this.state.tracking.pixel.trim()) {
      warnings.add('Pixel não configurado. A otimização pode ficar limitada.');
    }

    return Array.from(warnings);
  }

  hasCampaignWarnings(): boolean {
    return this.campaignWarnings().length > 0;
  }

  nextFocusLabel(): string {
    const next = this.campaignProblems()[0];
    return next || this.nextPendingSection().label;
  }

  totalSectionsCount(): number {
    return this.sectionProgress().length;
  }

  completedSectionsCount(): number {
    return this.sectionProgress().filter((item) => item.done).length;
  }

  scrollToSection(sectionId: string): void {
    if (
      [
        'builder-general',
        'builder-identity',
        'builder-audience',
        'builder-budget',
        'builder-schedule',
        'builder-placements',
        'builder-destination',
        'builder-creative',
        'builder-tracking',
      ].includes(sectionId)
    ) {
      this.creationMode.set('advanced');
      this.state.ui.aiFlowMode = 'advanced';
    }

    this.activeSection.set(sectionId);
    if (sectionId === 'builder-review') {
      this.markReviewVisited();
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onMainScroll(event: Event): void {
    const container = event.target as HTMLElement;
    let currentSection = this.sectionAnchors[0]?.id || 'builder-general';

    for (const section of this.sectionAnchors) {
      const element = document.getElementById(section.id);
      if (!element) continue;
      if (container.scrollTop >= element.offsetTop - 120) {
        currentSection = section.id;
      }
    }

    this.activeSection.set(currentSection);
  }

  submit(): void {
    if (this.submitting() || this.recoverySubmitting() || this.cleanupSubmitting()) {
      return;
    }

    this.submitAttempted.set(true);
    this.touchState(false);

    const draftGateMessage = this.pendingAiApplicationMessage();
    if (draftGateMessage) {
      this.submitError.set(draftGateMessage);
      this.ui.showWarning('Use a sugestão primeiro', draftGateMessage);
      return;
    }

    const aiConsistencyIssues = this.detectCriticalAiPayloadDivergences();
    if (aiConsistencyIssues.length) {
      const message = 'A publicação foi bloqueada porque o payload final divergiu da sugestão aplicada da IA.';
      this.submitError.set(message);
      console.error('[CampaignBuilder] blocking divergent submit', {
        issues: aiConsistencyIssues,
        aiLastSuggestion: this.buildAiSuggestionSnapshot(),
        expandedState: this.buildExpandedCampaignState(),
        apiPayload: this.buildApiPayload(),
      });
      this.ui.showError('Divergência crítica detectada', `${message} ${aiConsistencyIssues.join(' ')}`);
      return;
    }

    if (this.creationMode() === 'ai-result' && !this.state.ui.aiApplied) {
      const message = 'Aplique a sugestão da IA ao rascunho antes de tentar publicar na Meta.';
      this.submitError.set(message);
      this.ui.showWarning('Use a sugestão primeiro', message);
      return;
    }

    if (this.normalSubmitBlocked()) {
      const message = 'Parte da campanha ja foi criada na Meta. Use o recovery seguro para continuar sem duplicar recursos.';
      this.submitError.set(message);
      this.ui.showWarning('Execucao parcial detectada', message);
      return;
    }

    if (this.submitFailure()?.executionStatus === 'PARTIAL' && this.partialExecutionDirty()) {
      const message = 'Os campos foram alterados apos a execucao parcial. Revise e clique novamente para iniciar uma nova criacao normal.';
      this.clearSubmissionFailure();
      this.submitError.set(message);
      this.ui.showWarning('Revisao necessaria', message);
      return;
    }

    if (this.hasAiBlockingIssues()) {
      const message = 'Corrija os problemas obrigatórios antes de enviar a campanha.';
      this.submitError.set(message);
      this.submitFailure.set(null);
      this.ui.showWarning('Revisão obrigatória', message);
      this.scrollToSection(this.creationMode() === 'ai-result' ? 'builder-ai-result' : 'builder-review');
      return;
    }

    if (!this.canSubmit()) {
      const message = this.metaFrontendValidationMessage() || this.blockerMessage();
      this.submitError.set(message);
      this.submitFailure.set(null);
      this.ui.showWarning('Campanha ainda não pronta', message);
      this.scrollToSection(this.firstBlockingSectionId());
      return;
    }

    const storeId = this.storeContext.getValidSelectedStoreId();
    const store = this.storeContext.selectedStore();

    if (!storeId || !store) {
      const message = 'Selecione uma store válida antes de enviar a campanha.';
      this.submitError.set(message);
      this.ui.showWarning('Store obrigatória', message);
      return;
    }

    if (this.state.ui.aiValidationStale) {
      this.ui.showWarning(
        'Validação desatualizada',
        'A validação da IA pode não refletir as alterações recentes. Revise os pontos críticos antes de enviar.',
      );
    } else if (this.hasAiWarnings()) {
      this.ui.showWarning(
        'Atenção antes do envio',
        'A campanha pode ter performance reduzida. Revise os warnings antes de publicar.',
      );
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.submitFailure.set(null);
    this.partialExecutionSignature.set(null);
    this.technicalErrorOpen.set(false);

    const expandedState = this.buildExpandedCampaignState();
    const apiPayload = buildApiPayload(expandedState);
    this.logCampaignSubmissionComparison('create', expandedState, apiPayload);

    this.api.createMetaCampaign(storeId, apiPayload)
      .pipe(
        finalize(() => {
          this.submitting.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.clearSubmissionFailure();
          this.pendingCreatedEvent = {
            name: this.state.campaign.name.trim(),
            storeName: store.name,
            response: {
              ...response,
              initialStatus: this.state.campaign.initialStatus,
            },
          };
          this.successOverlay.set({
            name: this.state.campaign.name.trim(),
            response: {
              ...response,
              initialStatus: this.state.campaign.initialStatus,
            },
          });
          localStorage.removeItem(this.draftStorageKey());
          this.draftAvailable.set(false);
          this.ui.showSuccess('Campanha criada', 'A campanha foi criada na Meta com o payload real compatível.');
        },
        error: (err) => {
          console.error('Meta campaign submit failed', {
            error: err,
            responseError: err?.details ?? err?.error ?? err?.originalError?.error ?? null,
          });
          const failure = this.normalizeCampaignCreationError(err);
          const message = failure.message;
          this.submitFailure.set(failure);
          this.partialExecutionSignature.set(
            failure.executionStatus === 'PARTIAL' ? this.currentPayloadSignature() : null,
          );
          this.submitError.set(message);
          this.technicalErrorOpen.set(false);
          this.ui.showError('Não foi possível criar campanha', message);
          this.loadCreationContext(storeId);
        },
      });
  }

  continuePartialCreation(): void {
    const failure = this.submitFailure();
    const storeId = this.storeContext.getValidSelectedStoreId();
    const store = this.storeContext.selectedStore();

    if (!failure?.executionId || failure.executionStatus !== 'PARTIAL' || !storeId || !store) {
      return;
    }

    this.recoverySubmitting.set(true);
    this.submitError.set(null);

    this.api.retryMetaCampaignRecovery(storeId, failure.executionId, {})
      .pipe(
        finalize(() => {
          this.recoverySubmitting.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.clearSubmissionFailure();

          const successResponse = this.mapRecoverySuccessToCreateResponse(storeId, response);
          this.pendingCreatedEvent = {
            name: this.state.campaign.name.trim(),
            storeName: store.name,
            response: successResponse,
          };
          this.successOverlay.set({
            name: this.state.campaign.name.trim(),
            response: successResponse,
          });

          localStorage.removeItem(this.draftStorageKey());
          this.draftAvailable.set(false);
          this.ui.showSuccess('Campanha retomada', response.message || 'A campanha foi concluida com seguranca na Meta.');
        },
        error: (err) => {
          const nextFailure = this.normalizeCampaignCreationError(err);
          this.submitFailure.set(nextFailure);
          this.partialExecutionSignature.set(
            nextFailure.executionStatus === 'PARTIAL' ? this.currentPayloadSignature() : null,
          );
          this.submitError.set(nextFailure.message);
          this.technicalErrorOpen.set(false);
          this.ui.showError('Nao foi possivel continuar a criacao', nextFailure.message);
        },
      });
  }

  cleanupPartialCreation(): void {
    const failure = this.submitFailure();
    const storeId = this.storeContext.getValidSelectedStoreId();

    if (!failure?.executionId || failure.executionStatus !== 'PARTIAL' || !storeId) {
      return;
    }

    this.cleanupSubmitting.set(true);
    this.submitError.set(null);

    this.api.cleanupMetaCampaignRecovery(storeId, failure.executionId)
      .pipe(
        finalize(() => {
          this.cleanupSubmitting.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.clearSubmissionFailure();
          this.submitError.set(response.message || 'Execução parcial limpa com segurança.');
          this.ui.showSuccess('Execução limpa', response.message || 'Recursos parciais removidos com segurança.');
        },
        error: (err) => {
          const nextFailure = this.normalizeCampaignCreationError(err);
          this.submitFailure.set(nextFailure);
          this.submitError.set(nextFailure.message);
          this.ui.showError('Nao foi possivel limpar a execucao parcial', nextFailure.message);
        },
      });
  }

  buildExpandedCampaignState(): CampaignBuilderState {
    const clonedState = cloneCampaignBuilderState(this.state);
    clonedState.creative.cta = this.normalizeBuilderCta(clonedState.creative.cta, clonedState.destination.type);
    clonedState.audience.state = clonedState.audience.state.trim().toUpperCase();
    clonedState.audience.stateName = clonedState.audience.stateName.trim() || clonedState.audience.region.trim();
    clonedState.audience.region = clonedState.audience.stateName;
    clonedState.audience.city = clonedState.audience.city.trim();
    clonedState.audience.cityId = clonedState.audience.cityId ? Number(clonedState.audience.cityId) : null;
    return clonedState;
  }

  buildApiPayload(): CreateMetaCampaignRequest {
    return buildApiPayload(this.buildExpandedCampaignState());
  }

  private logCampaignApplyComparison(appliedCount: number, ignoredFields: string[]): void {
    if (!environment.enableLogging) {
      return;
    }

    const expandedState = this.buildExpandedCampaignState();
    const apiPayload = buildApiPayload(expandedState);
    console.info('[CampaignBuilder] apply suggestion sync', {
      aiApplied: this.state.ui.aiApplied,
      appliedCount,
      ignoredFields,
      aiLastSuggestion: this.buildAiSuggestionSnapshot(),
      summary: {
        objective: expandedState.campaign.objective,
        budgetValue: expandedState.budget.value,
        budgetType: expandedState.budget.budgetType,
        destinationType: expandedState.destination.type,
        hasWebsiteUrl: Boolean(expandedState.destination.websiteUrl),
        cta: expandedState.creative.cta,
        hasMessage: Boolean(expandedState.creative.message),
        hasHeadline: Boolean(expandedState.creative.headline),
        hasDescription: Boolean(expandedState.creative.description),
        payloadKeys: Object.keys(apiPayload).sort(),
      },
    });
  }

  private buildApplyTriggerSnapshot(): {
    aiApplied: boolean;
    objective: CampaignBuilderState['campaign']['objective'];
    budget: number | null;
    cta: string;
  } {
    return {
      aiApplied: this.state.ui.aiApplied,
      objective: this.state.campaign.objective,
      budget: this.state.budget.value || null,
      cta: this.state.creative.cta || '',
    };
  }

  private logCampaignSubmissionComparison(
    stage: 'create' | 'recovery',
    expandedState: CampaignBuilderState,
    apiPayload: CreateMetaCampaignRequest,
  ): void {
    if (!environment.enableLogging) {
      return;
    }

    console.info('[CampaignBuilder] submit payload comparison', {
      stage,
      aiLastSuggestion: this.buildAiSuggestionSnapshot(),
      summary: {
        objective: expandedState.campaign.objective,
        initialStatus: expandedState.campaign.initialStatus,
        budgetValue: expandedState.budget.value,
        budgetType: expandedState.budget.budgetType,
        destinationType: expandedState.destination.type,
        hasWebsiteUrl: Boolean(expandedState.destination.websiteUrl),
        messagesDestination: expandedState.destination.messagesDestination,
        cta: expandedState.creative.cta,
        hasMessage: Boolean(expandedState.creative.message),
        hasHeadline: Boolean(expandedState.creative.headline),
        hasDescription: Boolean(expandedState.creative.description),
        audienceCountry: expandedState.audience.country,
        audienceState: expandedState.audience.state,
        audienceCity: expandedState.audience.city,
        interestCount: expandedState.audience.interests.length,
        excludedInterestCount: expandedState.audience.excludedInterests.length,
        placementCount: expandedState.placements.selected.length,
        payloadKeys: Object.keys(apiPayload).sort(),
      },
    });
  }

  private buildAiSuggestionSnapshot(): Record<string, unknown> | null {
    const suggestion = this.state.ui.aiLastSuggestion;
    if (!suggestion) {
      return null;
    }

    return {
      status: suggestion.status,
      objective: suggestion.campaign.objective || suggestion.intent.objective,
      budget: suggestion.campaign.budget?.amount ?? suggestion.intent.budgetAmount,
      budgetType: suggestion.campaign.budget?.type ?? suggestion.intent.budgetType,
      destinationType: suggestion.intent.destinationType,
      cta: suggestion.creative.cta || suggestion.intent.cta,
      segment: suggestion.intent.segment,
      aiApplied: this.state.ui.aiApplied,
      aiValidationStale: this.state.ui.aiValidationStale,
      blockingIssues: suggestion.validation.blockingIssues,
      warnings: suggestion.validation.warnings,
    };
  }

  private pendingAiApplicationMessage(): string | null {
    if (!this.state.ui.aiLastSuggestion || this.state.ui.aiApplied) {
      return null;
    }

    return 'A sugestão da IA existe, mas ainda não foi aplicada ao rascunho que será publicado. Clique em "Usar essa sugestão" ou limpe a sugestão antes de enviar.';
  }

  private detectCriticalAiPayloadDivergences(): string[] {
    const suggestion = this.state.ui.aiLastSuggestion;
    if (!suggestion || !this.state.ui.aiApplied || this.state.ui.aiValidationStale) {
      return [];
    }

    const expandedState = this.buildExpandedCampaignState();
    const payload = buildApiPayload(expandedState);
    const issues: string[] = [];
    const expectedObjective = suggestion.campaign.objective || suggestion.intent.objective;
    const expectedBudget = Number(suggestion.campaign.budget?.amount ?? suggestion.intent.budgetAmount ?? 0);
    const expectedDestinationType = suggestion.intent.destinationType;
    const expectedCta = this.normalizeAiCta(
      suggestion.creative.cta || suggestion.intent.cta || '',
      expectedDestinationType || expandedState.destination.type,
    );

    if (expectedObjective && payload.objective !== expectedObjective) {
      issues.push(`Objetivo esperado: ${expectedObjective}; payload final: ${payload.objective}.`);
    }

    if (expectedBudget > 0 && payload.dailyBudget !== expectedBudget) {
      issues.push(`Orçamento esperado: ${expectedBudget}; payload final: ${payload.dailyBudget}.`);
    }

    if (expectedCta && payload.cta !== expectedCta) {
      issues.push(`CTA esperado: ${expectedCta}; payload final: ${payload.cta || 'vazio'}.`);
    }

    if (expectedDestinationType && expandedState.destination.type !== expectedDestinationType) {
      issues.push(`Destino esperado: ${expectedDestinationType}; builder final: ${expandedState.destination.type}.`);
    }

    if (expectedDestinationType === 'messages' && payload.destinationUrl) {
      issues.push('A sugestão aplicada era de mensagens, mas o payload final ainda contém destinationUrl de site.');
    }

    if (expectedDestinationType === 'site'
      && suggestion.creative.destinationUrl
      && isSecureHttpUrl(suggestion.creative.destinationUrl)
      && payload.destinationUrl !== suggestion.creative.destinationUrl) {
      issues.push('A sugestão aplicada era de site, mas a URL final divergiu do destino sugerido pela IA.');
    }

    return issues;
  }

  onCreativeAssetSelected(asset: Asset): void {
    if (asset.adAccountId && asset.adAccountId !== this.state.identity.adAccountId) {
      this.ui.showWarning(
        'Asset incompatível',
        'A imagem selecionada pertence a outra conta de anúncios. Escolha um asset da mesma conta da campanha.',
      );
      return;
    }

    this.state.creative.imageAssetId = asset.id;
    this.state.creative.imageUrl = asset.storageUrl;
    this.selectedCreativeAssetMeta.set(asset);
    this.markFieldTouched('creative.imageAssetId');
    this.touchState();
  }

  clearCreativeAssetSelection(): void {
    this.state.creative.imageAssetId = '';
    this.state.creative.imageUrl = '';
    this.selectedCreativeAssetMeta.set(null);
    this.markFieldTouched('creative.imageAssetId');
    this.touchState();
  }

  markFieldTouched(field: string): void {
    this.touchedFields.update((current) => ({
      ...current,
      [field]: true,
    }));
  }

  fieldInvalid(field: string): boolean {
    const shouldValidate = this.submitAttempted() || !!this.touchedFields()[field];
    if (!shouldValidate) return false;

    return fieldInvalid(this.state, field);
  }

  blockerMessage(): string {
    return blockerMessage(this.reviewContext());
  }

  selectedStoreName(): string {
    return this.storeContext.selectedStore()?.name || 'Selecione uma store';
  }

  selectedPageName(): string {
    return selectedPageName(this.integration());
  }

  selectedAdAccountName(): string {
    return selectedAdAccountName(this.internalAdAccounts(), this.state.identity.adAccountId);
  }

  selectedObjectiveLabel(): string {
    return selectedObjectiveLabel(this.objectiveOptions, this.state.campaign.objective);
  }

  audienceSummary(): string {
    return audienceSummary(this.state, this.genderOptions);
  }

  destinationSummary(): string {
    return destinationSummary(this.state);
  }

  trackingSummary(): string {
    return trackingSummary(this.state);
  }

  previewHeadline(): string {
    return this.state.creative.headline.trim() || this.state.campaign.name.trim() || 'Headline do anúncio';
  }

  previewDescription(): string {
    if (this.state.creative.description.trim()) return this.state.creative.description.trim();
    if (this.state.creative.message.trim()) return this.state.creative.message.trim().slice(0, 110);
    return 'Descrição do anúncio';
  }

  previewMessage(): string {
    return this.state.creative.message.trim() || 'A mensagem principal aparece aqui durante a revisão.';
  }

  previewCta(): string {
    return getCtaLabelByValue(this.state.creative.cta);
  }

  compatibilityNote(): string {
    return 'Publicação real: a primeira criação sempre sai PAUSED. O review operacional abaixo mostra apenas os campos enviados para a Meta e reutilizados no recovery.';
  }

  statusLabel(status?: IntegrationStatus): string {
    const labels: Record<IntegrationStatus, string> = {
      [IntegrationStatus.NOT_CONNECTED]: 'Não conectada',
      [IntegrationStatus.CONNECTING]: 'Conectando',
      [IntegrationStatus.CONNECTED]: 'Conectada',
      [IntegrationStatus.EXPIRED]: 'Token expirado',
      [IntegrationStatus.ERROR]: 'Erro',
    };
    return status ? labels[status] : 'Não conectada';
  }

  statusTone(status?: IntegrationStatus): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
    if (status === IntegrationStatus.CONNECTED) return 'success';
    if (status === IntegrationStatus.ERROR || status === IntegrationStatus.EXPIRED) return 'danger';
    if (status === IntegrationStatus.CONNECTING) return 'info';
    return 'neutral';
  }

  canSubmit(): boolean {
    return canSubmit(this.reviewContext());
  }

  submitButtonDisabled(): boolean {
    return !this.canSubmit()
      || this.hasAiBlockingIssues()
      || this.hasExecutivePublishBlock()
      || this.recoverySubmitting()
      || this.cleanupSubmitting()
      || this.normalSubmitBlocked()
      || this.submitting();
  }

  submitButtonLabel(): string {
    if (this.recoverySubmitting()) return 'Continuando criacao na Meta...';
    if (this.cleanupSubmitting()) return 'Limpando execucao parcial...';
    if (this.submitting()) return 'Criando campanha na Meta...';
    if (this.normalSubmitBlocked()) return 'Use o recovery seguro';
    if (this.isMessagesAutomaticPublishBlocked()) return 'Publicacao automatica indisponivel';
    if (this.hasExecutivePublishBlock() || this.hasAiBlockingIssues() || !this.canSubmit()) return 'Corrija antes de publicar';
    return 'Publicar campanha';
  }

  metaCreationLoadingLabel(): string {
    if (this.recoverySubmitting()) {
      return 'Continuando criacao parcial com o fluxo seguro da Meta...';
    }
    if (this.cleanupSubmitting()) {
      return 'Limpando recursos parciais para impedir duplicacao na Meta...';
    }
    if (this.submitting()) {
      return 'Criando campanha na Meta...';
    }
    return '';
  }

  firstBlockingSectionId(): string {
    return firstBlockingSectionId(this.reviewContext());
  }

  sectionTone(sectionId: string): 'success' | 'warning' | 'neutral' {
    const section = this.sectionProgress().find((item) => item.id === sectionId);
    if (!section) return 'neutral';
    return section.done ? 'success' : 'warning';
  }

  sectionModeLabel(sectionId: string): string {
    if (sectionId === 'builder-ai') {
      return 'Assistente';
    }
    if (['builder-general', 'builder-identity', 'builder-budget', 'builder-destination', 'builder-creative'].includes(sectionId)) {
      return 'Envio Meta atual';
    }
    return 'Planejamento interno';
  }

  aiSectionComplete(): boolean {
    return aiSectionComplete(this.state);
  }

  finishSuccessFlow(): void {
    const event = this.pendingCreatedEvent;
    this.successOverlay.set(null);
    if (event) {
      this.created.emit(event);
      this.pendingCreatedEvent = null;
    }
    this.close.emit();
  }

  trackByValue(_: number, item: { value?: string; id?: string | number; label?: string; code?: string }): string {
    return String(item.value || item.id || item.code || item.label || '');
  }

  hasMissingConfiguredPage(): boolean {
    return this.isIntegrationConnected() && !this.hasConfiguredPage();
  }

  metaStepLabel(step?: MetaCampaignExecutionStep | string | null): string {
    switch (step) {
      case 'campaign':
        return 'Campanha';
      case 'adset':
        return 'Conjunto de anuncios';
      case 'creative':
        return 'Criativo';
      case 'ad':
        return 'Anuncio';
      case 'persist':
        return 'Persistencia local';
      default:
        return 'Nao informada';
    }
  }

  partialResourceEntries(ids?: MetaCampaignPartialIds | null): Array<{ label: string; value: string }> {
    if (!ids) return [];

    return [
      { label: 'Campanha', value: ids.campaignId || '' },
      { label: 'Conjunto', value: ids.adSetId || '' },
      { label: 'Criativo', value: ids.creativeId || '' },
      { label: 'Anuncio', value: ids.adId || '' },
    ].filter((item) => item.value);
  }

  technicalMetaErrorEntries(metaError?: MetaCampaignErrorDetails): Array<{ label: string; value: string }> {
    if (!metaError) return [];

    return [
      { label: 'Mensagem Meta', value: metaError.message || '' },
      { label: 'Codigo', value: metaError.code != null ? String(metaError.code) : '' },
      { label: 'Subcodigo', value: metaError.subcode != null ? String(metaError.subcode) : '' },
      { label: 'Titulo', value: metaError.userTitle || '' },
      { label: 'Mensagem ao usuario', value: metaError.userMessage || '' },
    ].filter((item) => item.value);
  }

  shouldShowPartialRecoveryGuidance(): boolean {
    const failure = this.submitFailure();
    return failure?.executionStatus === 'PARTIAL' && !this.canContinuePartialCreation();
  }

  publishPreview(): Record<string, unknown> {
    const payload = this.buildApiPayload();
    const selectedAccount = this.internalAdAccounts().find((account) => account.id === this.state.identity.adAccountId);
    const selectedAsset = this.selectedCreativeAssetMeta();

    return {
      publishMode: 'PAUSED_ONLY',
      campaign: {
        name: payload.name,
        objective: payload.objective,
        initialStatus: 'PAUSED',
      },
      adset: {
        dailyBudget: payload.dailyBudget,
        startTime: payload.startTime,
        endTime: payload.endTime || null,
        placements: payload.placements || [],
        targeting: {
          country: payload.country,
          state: payload.state || null,
          stateName: payload.stateName || null,
          city: payload.city || null,
          cityId: payload.cityId || null,
          ageMin: payload.ageMin,
          ageMax: payload.ageMax,
          gender: payload.gender,
        },
        pixelId: payload.pixelId || null,
        conversionEvent: payload.conversionEvent || null,
      },
      creative: {
        message: payload.message,
        headline: payload.headline || null,
        description: payload.description || null,
        cta: payload.cta || null,
        destinationUrl: payload.destinationUrl || null,
        imageAssetId: payload.imageAssetId || null,
        imageHash: selectedAsset?.metaImageHash || null,
      },
      metaContext: {
        adAccountId: payload.adAccountId,
        adAccountExternalId: selectedAccount?.externalId || selectedAccount?.metaId || null,
        pageId: this.integration()?.pageId || null,
        pageName: this.integration()?.pageName || null,
      },
    };
  }

  publishPreviewTargetingSummary(): string {
    const preview = this.publishPreview() as {
      adset?: { targeting?: { country?: string; ageMin?: number; ageMax?: number; gender?: string } };
    };
    const targeting = preview.adset?.targeting;
    if (!targeting) return '--';
    return `${targeting.country || '--'} · ${targeting.ageMin || '--'}-${targeting.ageMax || '--'} · ${targeting.gender || '--'}`;
  }

  publishPreviewPlacementsSummary(): string {
    const preview = this.publishPreview() as { adset?: { placements?: string[] } };
    return preview.adset?.placements?.join(', ') || 'Nenhum';
  }

  private reviewContext() {
    return {
      state: this.state,
      integration: this.integration(),
      adAccounts: this.internalAdAccounts(),
      selectedStoreId: this.storeContext.selectedStoreId(),
      validStoreId: this.storeContext.getValidSelectedStoreId(),
      selectedStoreName: this.selectedStoreName(),
      loadingContext: this.loadingContext(),
      submitting: this.submitting(),
      contextError: this.contextError(),
      objectiveOptions: this.objectiveOptions,
      genderOptions: this.genderOptions,
    };
  }

  private buildAiSuggestionRequest(prompt: string, storeId: string): CampaignSuggestionRequest {
    const companyContext = this.companyProfile.profile();
    const explicitPromptBudget = this.extractBudgetFromPrompt(prompt);
    const extraContextLines = [
      companyContext.businessName ? `Empresa: ${companyContext.businessName}` : '',
      companyContext.businessSegment ? `Segmento: ${companyContext.businessSegment}` : '',
      companyContext.city || companyContext.state ? `Local: ${[companyContext.city, companyContext.state].filter(Boolean).join(' / ')}` : '',
      companyContext.website ? `Website: ${companyContext.website}` : '',
      companyContext.instagram ? `Instagram: ${companyContext.instagram}` : '',
      companyContext.whatsapp ? `WhatsApp: ${companyContext.whatsapp}` : '',
      this.state.ui.aiExtraContext.trim(),
    ].filter(Boolean);

    return {
      prompt,
      storeId,
      goal: this.state.ui.aiGoal.trim() || this.selectedObjectiveLabel(),
      funnelStage: this.state.ui.aiFunnelStage || undefined,
      budget: explicitPromptBudget ?? this.state.ui.aiBudget ?? this.state.budget.value ?? undefined,
      durationDays: this.state.ui.aiDurationDays || undefined,
      primaryOffer: this.state.ui.aiPrimaryOffer.trim() || undefined,
      destinationType: this.state.ui.aiDestinationType || undefined,
      region: this.state.ui.aiRegion.trim()
        || this.state.audience.city.trim()
        || companyContext.city.trim()
        || this.state.audience.stateName.trim()
        || this.state.audience.region.trim()
        || companyContext.state.trim()
        || undefined,
      extraContext: extraContextLines.join(' | ') || undefined,
    };
  }

  private extractBudgetFromPrompt(prompt: string): number | null {
    const text = (prompt || '').trim();
    if (!text) {
      return null;
    }

    const patterns = [
      /(?:or[cç]amento|orcamento|budget|investimento|verba|valor)[^\d]{0,24}(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)/i,
      /r\$\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)/i,
      /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)\s*(?:por dia|\/dia|ao dia|di[aá]ri[oa])/i,
      /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)\s*(?:por campanha|campanha inteira|total)/i,
    ];
    for (const pattern of patterns) {
      const value = text.match(pattern)?.[1];
      const parsed = this.normalizePromptBudgetNumber(value);
      if (parsed !== null) {
        return parsed;
      }
    }

    return null;
  }

  private normalizePromptBudgetNumber(value: string | undefined): number | null {
    const text = (value || '').replace(/\s+/g, '');
    if (!text) {
      return null;
    }

    if (text.includes(',') && text.includes('.')) {
      const parsed = Number(text.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    }

    if (text.includes(',') && !text.includes('.')) {
      const commaParts = text.split(',');
      if (commaParts[1] && commaParts[1].length === 2) {
        const parsed = Number(text.replace(',', '.'));
        return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
      }
      const parsed = Number(text.replace(/,/g, ''));
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    }

    const parsed = Number(text.replace(/\./g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  private buildCampaignCopilotRequest(storeId: string): CampaignCopilotAnalysisRequest {
    return {
      storeId,
      campaign: {
        name: this.state.campaign.name.trim() || null,
        objective: this.state.campaign.objective,
        initialStatus: this.state.campaign.initialStatus,
      },
      adSet: {
        optimizationGoal: this.state.budget.optimizationGoal.trim() || null,
        billingEvent: this.state.budget.billingEvent.trim() || null,
      },
      creative: {
        message: this.state.creative.message.trim() || null,
        headline: this.state.creative.headline.trim() || null,
        description: this.state.creative.description.trim() || null,
        imageAssetId: this.state.creative.imageAssetId.trim() || null,
        imageUrl: this.state.creative.imageUrl.trim() || null,
      },
      targeting: {
        autoAudience: this.state.audience.autoAudience,
        country: this.state.audience.country.trim() || null,
        state: this.state.audience.state.trim() || null,
        stateName: this.state.audience.stateName.trim() || null,
        city: this.state.audience.city.trim() || null,
        ageMin: this.state.audience.ageMin || null,
        ageMax: this.state.audience.ageMax || null,
        gender: this.state.audience.gender,
        interests: this.state.audience.interests
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        placements: this.state.placements.selected,
      },
      budget: {
        type: this.state.budget.budgetType,
        value: this.state.budget.value || null,
        bidStrategy: this.state.budget.bidStrategy.trim() || null,
        optimizationGoal: this.state.budget.optimizationGoal.trim() || null,
      },
      location: {
        country: this.state.audience.country.trim() || null,
        state: this.state.audience.state.trim() || null,
        stateName: this.state.audience.stateName.trim() || null,
        city: this.state.audience.city.trim() || null,
        radiusKm: this.state.audience.radiusKm || null,
      },
      objective: this.state.campaign.objective,
      cta: this.state.creative.cta,
      destinationUrl: this.state.destination.websiteUrl.trim() || undefined,
    };
  }

  isIndividualAccount(): boolean {
    return this.accountContext.isIndividualAccount();
  }

  private normalizeCopilotConfidence(result: CampaignCopilotAnalysisResponse): CampaignCopilotAnalysisResponse {
    return {
      ...result,
      analysis: {
        ...result.analysis,
        improvements: (result.analysis?.improvements || []).map((item, index) => ({
          ...item,
          id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `improvement-${index + 1}`,
          confidence: Math.max(0, Math.min(100, Number(item?.confidence ?? result.analysis?.confidence ?? result.analysis?.overallScore ?? 0))),
        })),
        confidence: Math.max(0, Math.min(100, Number(result.analysis?.confidence ?? result.analysis?.overallScore ?? 0))),
        overallScore: Math.max(0, Math.min(100, Number(result.analysis?.overallScore ?? 0))),
      },
    };
  }

  private applyAiTrustMetadata(result: CampaignAiStructuredResponse): void {
    this.state.ui.aiConfidence = result.review.confidence;
    this.state.ui.aiStrengths = (result.review.strengths || []).slice(0, 6);
    this.state.ui.aiAssumptions = (result.planner.assumptions || []).slice(0, 6);
    this.state.ui.aiMissingInputs = (result.planner.missingInputs || []).slice(0, 6);
    this.state.ui.aiRiskWarnings = (result.review.risks || []).slice(0, 6);
    this.state.ui.aiRecommendations = (result.review.recommendations || []).slice(0, 6);
    this.state.ui.aiValidationReady = result.validation.isReadyToPublish;
    this.state.ui.aiQualityScore = result.validation.qualityScore;
    this.state.ui.aiBlockingIssues = (result.validation.blockingIssues || []).slice(0, 6);
    this.state.ui.aiValidationWarnings = (result.validation.warnings || []).slice(0, 6);
    this.state.ui.aiValidationRecommendations = (result.validation.recommendations || []).slice(0, 6);
    this.state.ui.aiValidationStale = false;
    this.state.ui.aiUsedFallback = !!result.meta?.usedFallback;
  }

  private mapWizardObjectiveToCampaignObjective(objectiveId: WizardObjectiveId): CampaignObjective {
    switch (objectiveId) {
      case 'receive-messages':
        return 'OUTCOME_LEADS';
      case 'promote-offer':
        return 'REACH';
      case 'sell-more':
      case 'drive-site':
      default:
        return 'OUTCOME_TRAFFIC';
    }
  }

  private applyEntryMode(mode: CampaignCreationEntryMode): void {
    this.creationEntryMode.set(mode);
    this.state.ui.builderMode = mode;
    const nextStep = mode === 'ai' ? 'ai-entry' : 'edit-lite';
    this.creationMode.set(nextStep);
    this.state.ui.aiFlowMode = nextStep;
    this.activeSection.set(nextStep === 'ai-entry' ? 'builder-ai' : 'builder-lite');
  }

  aiValidation(): AiValidationOutput | null {
    return this.state.ui.aiLastSuggestion?.validation || null;
  }

  aiCopilotAnalysis(): AiCampaignCopilotAnalysis | null {
    return this.state.ui.aiCopilotAnalysis?.analysis || null;
  }

  aiCopilotVisibleImprovements(): AiCampaignCopilotImprovement[] {
    return (this.aiCopilotAnalysis()?.improvements || []).filter((item) => !this.isCopilotImprovementIgnored(item.id));
  }

  hasAiCopilotAnalysis(): boolean {
    return !!this.aiCopilotAnalysis();
  }

  aiCopilotConfidenceValue(): number {
    return Math.max(0, Math.min(100, Number(this.aiCopilotAnalysis()?.confidence ?? this.aiCopilotAnalysis()?.overallScore ?? 0)));
  }

  aiCopilotStatusLabel(): string {
    if (this.state.ui.aiCopilotStale) {
      return 'Revise novamente';
    }
    const decision = this.aiCopilotAnalysis()?.executiveDecision?.decision;
    if (decision === 'PUBLISH') return 'Pode publicar';
    if (decision === 'BLOCK') return 'Corrija antes de publicar';
    if (decision === 'REVIEW') return 'Revise antes de publicar';
    if (decision === 'RESTRUCTURE') return 'Precisa de ajustes maiores';
    return this.scoreStatusLabel(this.aiCopilotConfidenceValue());
  }

  aiCopilotDetail(): string {
    const analysis = this.aiCopilotAnalysis();
    if (!analysis) {
      return 'Use a análise manual para revisar público, criativo, orçamento e destino antes de publicar.';
    }
    if (this.state.ui.aiCopilotStale) {
      return 'A análise foi gerada antes das últimas mudanças e pode precisar de uma nova revisão.';
    }
    return analysis.executiveDecision?.reason
      || analysis.blockingIssues[0]
      || analysis.warnings[0]
      || analysis.businessDiagnosis?.summary
      || 'A campanha está pronta para ajustes finos antes do envio.';
  }

  aiCopilotBlockingIssues(): string[] {
    return this.aiCopilotAnalysis()?.blockingIssues || [];
  }

  aiCopilotWarnings(): string[] {
    return this.aiCopilotAnalysis()?.warnings || [];
  }

  aiCopilotRecommendations(): string[] {
    return this.aiCopilotAnalysis()?.recommendations || [];
  }

  hasExecutivePublishBlock(): boolean {
    return !!this.executivePublishBlockMessage();
  }

  executivePublishBlockMessage(): string | null {
    return executivePublishBlockMessage(this.state);
  }

  executiveReviewAlert(): string | null {
    return executivePublishState(this.state)?.message || null;
  }

  executiveReviewTitle(): string | null {
    return executivePublishState(this.state)?.title || null;
  }

  executiveReviewTone(): 'success' | 'warning' | 'danger' | 'info' {
    return executivePublishState(this.state)?.tone || 'info';
  }

  executiveDecisionSummary(): string | null {
    const analysis = this.aiCopilotAnalysis();
    if (!analysis || this.state.ui.aiCopilotStale) {
      return null;
    }

    return analysis.executiveDecision?.reason
      || analysis.businessDiagnosis?.summary
      || analysis.blockingIssues?.[0]
      || analysis.warnings?.[0]
      || null;
  }

  stepStateEntries(error: MetaCampaignCreationError): Array<{ label: string; status: string }> {
    const stepState = error.stepState || {};
    return Object.entries(stepState)
      .filter(([, value]) => !!value)
      .map(([key, value]) => ({
        label: key,
        status: `${value.status}${value.errorMessage ? `: ${value.errorMessage}` : ''}`,
      }));
  }

  isCopilotImprovementApplied(id: string): boolean {
    return this.state.ui.aiCopilotAppliedImprovementIds.includes(id);
  }

  isCopilotImprovementIgnored(id: string): boolean {
    return this.state.ui.aiCopilotIgnoredImprovementIds.includes(id);
  }

  copilotImprovementPreview(improvement: AiCampaignCopilotImprovement): string {
    if (improvement.type === 'budget') {
      return this.formatCurrency(Number(improvement.suggestedValue || 0));
    }

    if (improvement.type === 'targeting' && improvement.suggestedValue && typeof improvement.suggestedValue === 'object') {
      const payload = improvement.suggestedValue as Record<string, unknown>;
      const parts: string[] = [];
      const interests = Array.isArray(payload['interests']) ? payload['interests'].map((item) => String(item).trim()).filter(Boolean) : [];
      if (interests.length) parts.push(`Interesses: ${interests.join(', ')}`);
      if (typeof payload['ageMin'] === 'number' || typeof payload['ageMax'] === 'number') {
        parts.push(`Idade: ${payload['ageMin'] ?? this.state.audience.ageMin}-${payload['ageMax'] ?? this.state.audience.ageMax}`);
      }
      if (typeof payload['city'] === 'string' && payload['city'].trim()) {
        parts.push(`Cidade: ${payload['city'].trim()}`);
      }
      if (typeof payload['state'] === 'string' && payload['state'].trim()) {
        parts.push(`UF: ${payload['state'].trim()}`);
      }
      return parts.join(' " ') || improvement.description;
    }

    return String(improvement.suggestedValue || '').trim() || improvement.description;
  }

  applyCopilotImprovement(improvement: AiCampaignCopilotImprovement): void {
    this.state.ui.aiCopilotApplyError = null;
    this.state.ui.aiCopilotLastAppliedMessage = null;

    const previousState = this.buildUndoSnapshotState();
    const applied = this.applyCopilotImprovementToBuilder(improvement);
    if (!applied) {
      return;
    }

    this.state.ui.aiCopilotAppliedImprovementIds = Array.from(new Set([
      ...this.state.ui.aiCopilotAppliedImprovementIds,
      improvement.id,
    ]));
    this.state.ui.aiCopilotIgnoredImprovementIds = this.state.ui.aiCopilotIgnoredImprovementIds.filter((id) => id !== improvement.id);
    this.state.ui.aiCopilotUndoSnapshot = {
      improvementId: improvement.id,
      label: improvement.label,
      previousState,
    };
    this.state.ui.aiCopilotLastAppliedMessage = `${improvement.label} aplicada.`;
    this.touchState(true);
    this.ui.showSuccess('Sugestão aplicada', `${improvement.label} foi atualizada no builder.`);
  }

  ignoreCopilotImprovement(improvementId: string): void {
    this.state.ui.aiCopilotIgnoredImprovementIds = Array.from(new Set([
      ...this.state.ui.aiCopilotIgnoredImprovementIds,
      improvementId,
    ]));
    this.state.ui.aiCopilotLastAppliedMessage = null;
    this.state.ui.aiCopilotApplyError = null;
    this.touchState(false);
  }

  undoLastCopilotImprovement(): void {
    const snapshot = this.state.ui.aiCopilotUndoSnapshot;
    if (!snapshot) {
      return;
    }

    this.state = cloneCampaignBuilderState(snapshot.previousState);
    this.state.ui.aiCopilotAppliedImprovementIds = this.state.ui.aiCopilotAppliedImprovementIds.filter((id) => id !== snapshot.improvementId);
    this.state.ui.aiCopilotUndoSnapshot = null;
    this.state.ui.aiCopilotApplyError = null;
    this.state.ui.aiCopilotLastAppliedMessage = `${snapshot.label} desfeita.`;
    this.touchState(true);
    this.ui.showSuccess('Alteração desfeita', `${snapshot.label} voltou ao valor anterior.`);
  }

  private buildUndoSnapshotState(): CampaignBuilderState {
    return cloneCampaignBuilderState({
      ...this.state,
      ui: {
        ...this.state.ui,
        aiCopilotLastAppliedMessage: null,
        aiCopilotApplyError: null,
        aiCopilotUndoSnapshot: null,
      },
    });
  }

  private applyCopilotImprovementToBuilder(improvement: AiCampaignCopilotImprovement): boolean {
    switch (improvement.type) {
      case 'headline':
        return this.applyCopilotHeadline(improvement);
      case 'primaryText':
        return this.applyCopilotPrimaryText(improvement);
      case 'cta':
        return this.applyCopilotCta(improvement);
      case 'budget':
        return this.applyCopilotBudget(improvement);
      case 'url':
        return this.applyCopilotUrl(improvement);
      case 'targeting':
        return this.applyCopilotTargeting(improvement);
      default:
        this.setCopilotApplyError('Esse tipo de sugestão ainda não pode ser aplicado com segurança.');
        return false;
    }
  }

  private applyCopilotHeadline(improvement: AiCampaignCopilotImprovement): boolean {
    const value = typeof improvement.suggestedValue === 'string' ? improvement.suggestedValue.trim() : '';
    if (!value) {
      this.setCopilotApplyError('A headline sugerida veio vazia e não foi aplicada.');
      return false;
    }

    this.state.creative.headline = value;
    return true;
  }

  private applyCopilotPrimaryText(improvement: AiCampaignCopilotImprovement): boolean {
    const value = typeof improvement.suggestedValue === 'string' ? improvement.suggestedValue.trim() : '';
    if (!value) {
      this.setCopilotApplyError('A copy sugerida veio vazia e não foi aplicada.');
      return false;
    }

    this.state.creative.message = value;
    return true;
  }

  private applyCopilotCta(improvement: AiCampaignCopilotImprovement): boolean {
    const value = typeof improvement.suggestedValue === 'string' ? improvement.suggestedValue.trim() : '';
    if (!value) {
      this.setCopilotApplyError('O CTA sugerido é inválido e não foi aplicado.');
      return false;
    }

    this.state.creative.cta = this.normalizeBuilderCta(value, this.state.destination.type);
    return true;
  }

  private applyCopilotBudget(improvement: AiCampaignCopilotImprovement): boolean {
    const value = Number(improvement.suggestedValue);
    if (!(value > 0)) {
      this.setCopilotApplyError('O orçamento sugerido é inválido e não foi aplicado.');
      return false;
    }

    this.state.budget.value = Math.round(value);
    this.state.budget.quickBudget = Math.round(value);
    return true;
  }

  private applyCopilotUrl(improvement: AiCampaignCopilotImprovement): boolean {
    const value = typeof improvement.suggestedValue === 'string' ? improvement.suggestedValue.trim() : '';
    if (!value || !isSecureHttpUrl(value)) {
      this.setCopilotApplyError('A URL sugerida precisa usar https e não foi aplicada.');
      return false;
    }

    this.state.destination.websiteUrl = value;
    return true;
  }

  private applyCopilotTargeting(improvement: AiCampaignCopilotImprovement): boolean {
    if (!improvement.suggestedValue || typeof improvement.suggestedValue !== 'object' || Array.isArray(improvement.suggestedValue)) {
      this.setCopilotApplyError('A sugestão de público veio em formato inválido e não foi aplicada.');
      return false;
    }

    const value = improvement.suggestedValue as Record<string, unknown>;
    const ageMin = typeof value['ageMin'] === 'number' ? Math.round(value['ageMin']) : null;
    const ageMax = typeof value['ageMax'] === 'number' ? Math.round(value['ageMax']) : null;
    if ((ageMin !== null && ageMin < 18) || (ageMax !== null && ageMax > 65) || (ageMin !== null && ageMax !== null && ageMin > ageMax)) {
      this.setCopilotApplyError('A faixa etária sugerida é inválida e não foi aplicada.');
      return false;
    }

    const interests = Array.isArray(value['interests'])
      ? value['interests'].map((item) => String(item).trim()).filter(Boolean)
      : [];
    const stateValue = typeof value['state'] === 'string' ? value['state'].trim() : '';
    const cityValue = typeof value['city'] === 'string' ? value['city'].trim() : '';
    let stateOption: IbgeState | null = null;

    if (stateValue) {
      stateOption = this.findIbgeState(stateValue);
      if (!stateOption) {
        this.setCopilotApplyError('A UF sugerida não foi reconhecida e não foi aplicada.');
        return false;
      }
    }

    const appliedSomething = interests.length > 0 || ageMin !== null || ageMax !== null || !!stateValue || !!cityValue;
    if (!appliedSomething) {
      this.setCopilotApplyError('A sugestão de público não trouxe ajustes válidos para aplicar.');
      return false;
    }

    if (interests.length) {
      this.state.audience.interests = interests.join(', ');
    }
    if (ageMin !== null) {
      this.state.audience.ageMin = ageMin;
    }
    if (ageMax !== null) {
      this.state.audience.ageMax = ageMax;
    }

    if (stateOption) {
      this.state.audience.state = stateOption.code;
      this.state.audience.stateName = stateOption.name;
      this.state.audience.region = stateOption.name;
      this.loadIbgeCities(stateOption.code, true);
    }

    if (cityValue) {
      const cityOption = this.findIbgeCity(cityValue, null);
      if (cityOption) {
        this.state.audience.city = cityOption.name;
        this.state.audience.cityId = cityOption.id;
      }
    }

    return true;
  }

  private setCopilotApplyError(message: string): void {
    this.state.ui.aiCopilotApplyError = message;
    this.ui.showWarning('Sugestão não aplicada', message);
  }

  hasAiBlockingIssues(): boolean {
    return !!this.aiValidation()?.blockingIssues.length && !this.state.ui.aiValidationStale;
  }

  hasAiWarnings(): boolean {
    return !!this.aiValidation()?.warnings.length;
  }

  hasAiQualitySignal(): boolean {
    return !!this.aiValidation() || Number(this.state.ui.aiQualityScore) > 0;
  }

  qualityScoreValue(): number {
    return this.aiValidation()?.qualityScore ?? this.state.ui.aiQualityScore ?? 0;
  }

  qualityScoreStatus(): string {
    if (this.state.ui.aiValidationStale) {
      return 'Desatualizada';
    }
    if (!this.hasAiQualitySignal()) {
      return 'Pendente';
    }
    return this.scoreStatusLabel(this.qualityScoreValue());
  }

  qualityScoreDetail(): string {
    if (this.state.ui.aiValidationStale) {
      return 'A validação da IA precisa ser revisada após as últimas edições.';
    }

    const validation = this.aiValidation();
    if (!validation) {
      return 'Gere uma sugestão com IA para calcular qualidade automática.';
    }

    if (this.isMessagesAutomaticPublishBlocked()) {
      return 'A IA pode sugerir estratégia e estrutura para mensagens, mas a publicação automática atual é apenas para campanhas de website.';
    }

    if (validation.blockingIssues.length) {
      return `${validation.blockingIssues.length} bloqueio(s) e ${validation.warnings.length} alerta(s) para revisar antes do envio.`;
    }

    if (validation.warnings.length) {
      return `${validation.warnings.length} alerta(s) ainda pedem ajuste fino.`;
    }

    if (validation.recommendations.length) {
      return validation.recommendations[0] || 'Campanha consistente para seguir com revisão final.';
    }

    return validation.isReadyToPublish
      ? 'Sinal verde para seguir com a revisão final.'
      : 'Revise a campanha antes de publicar.';
  }

  aiValidationTone(): 'success' | 'danger' {
    if (this.isMessagesAutomaticPublishBlocked()) {
      return 'danger';
    }
    return this.aiValidation()?.isReadyToPublish && !this.state.ui.aiValidationStale ? 'success' : 'danger';
  }

  aiValidationStatusLabel(): string {
    if (this.state.ui.aiValidationStale) {
      return 'Validação desatualizada';
    }
    if (this.isMessagesAutomaticPublishBlocked()) {
      return 'Revisao necessaria';
    }
    return this.aiValidation()?.isReadyToPublish ? 'Pronta para publicação' : 'Revisão necessária antes de publicar';
  }

  publishReadinessLabel(): string {
    if (this.isMessagesAutomaticPublishBlocked()) {
      return 'Revisao necessaria';
    }
    const publishState = executivePublishState(this.state);
    if (publishState && !publishState.canPublish) {
      return 'Revisao necessaria';
    }
    return this.canSubmit() ? 'Pronta para publicar' : 'Revisao necessaria';
  }

  publishReadinessTone(): 'success' | 'warning' | 'info' {
    if (this.isMessagesAutomaticPublishBlocked()) {
      return 'info';
    }
    const publishState = executivePublishState(this.state);
    if (publishState) {
      return publishState.canPublish && this.canSubmit() ? 'success' : 'warning';
    }
    return this.canSubmit() ? 'success' : 'warning';
  }

  publishReadinessSummary(): string {
    if (this.isMessagesAutomaticPublishBlocked()) {
      return 'Publicacao automatica indisponivel para campanhas de conversa no momento.';
    }
    const executiveMessage = this.executivePublishBlockMessage();
    if (executiveMessage) {
      return executiveMessage;
    }
    return this.canSubmit() ? 'Campanha pronta para publicar.' : `${this.nextPendingSection().label} pendente`;
  }

  isMessagesAutomaticPublishBlocked(): boolean {
    return this.state.destination.type === 'messages';
  }

  messagesPublishScopeMessage(): string {
    return META_MESSAGES_PUBLISH_SCOPE_MESSAGE;
  }

  scoreTone(score: number): 'danger' | 'warning' | 'info' | 'success' {
    if (score >= 90) return 'success';
    if (score >= 70) return 'info';
    if (score >= 40) return 'warning';
    return 'danger';
  }

  scoreStatusLabel(score: number): string {
    if (score >= 90) return 'Excelente';
    if (score >= 70) return 'Boa';
    if (score >= 40) return 'Atenção';
    return 'Crítica';
  }

  scoreColor(score: number): string {
    if (score >= 90) return '#16A34A';
    if (score >= 70) return '#2563EB';
    if (score >= 40) return '#F59E0B';
    return '#DC2626';
  }

  requiredIssueLabels(): string[] {
    const issues = new Set<string>();

    if (!this.state.campaign.name.trim()) issues.add('nome');
    if (!this.state.identity.adAccountId.trim()) issues.add('conta');
    if (this.hasMissingConfiguredPage()) issues.add('pagina');
    if (!(Number(this.state.budget.value) > 0)) issues.add('orcamento');
    if (!this.isValidCountry(this.state.audience.country)) issues.add('pais');
    if (this.state.audience.country.trim().toUpperCase() === 'BR' && this.state.audience.city.trim() && !this.state.audience.state.trim()) issues.add('uf');
    if (!this.state.destination.websiteUrl.trim() || !isSecureHttpUrl(this.state.destination.websiteUrl)) issues.add('url');
    if (!this.state.creative.message.trim()) issues.add('mensagem');
    if (!this.state.creative.headline.trim()) issues.add('headline');
    if (!this.state.creative.imageAssetId.trim()) issues.add('imagem');
    if (this.aiValidation()?.blockingIssues.length) issues.add('revisao IA');

    return Array.from(issues);
  }

  progressDetail(): string {
    return this.hasCampaignProblems()
      ? `Próximo foco: ${this.nextFocusLabel()}`
      : 'Fluxo principal preenchido e pronto para revisão final.';
  }

  completedSectionsStatus(completed: number, total: number): string {
    if (total === 0) return 'Pendente';
    if (completed >= total) return 'Completo';
    return 'Em andamento';
  }

  private formatIssueHint(issues: string[]): string {
    if (!issues.length) return '';
    return `: ${issues.slice(0, 3).join(', ')}`;
  }

  private buildAiDetectedFields(result: CampaignAiStructuredResponse): string[] {
    return [
      result.planner.businessType ? 'Tipo de negócio' : '',
      result.planner.goal ? 'Objetivo comercial' : '',
      result.planner.funnelStage ? 'Funil' : '',
      result.campaign.campaignName ? 'Nome' : '',
      result.campaign.objective ? 'Objetivo' : '',
      result.campaign.budget?.amount ? 'Orçamento' : '',
      result.adSet.targeting.country ? 'País' : '',
      result.adSet.targeting.stateCode || result.adSet.targeting.state ? 'UF' : '',
      result.adSet.targeting.city ? 'Cidade' : '',
      result.adSet.targeting.interests?.length ? 'Interesses' : '',
      result.creative.primaryText ? 'Mensagem' : '',
      result.creative.headline ? 'Headline' : '',
      result.creative.cta ? 'CTA' : '',
      result.creative.destinationUrl ? 'URL de destino' : '',
      result.creative.imageSuggestion ? 'Sugestão de imagem' : '',
    ].filter(Boolean);
  }

  private applyStructuredAiSuggestion(result: CampaignAiStructuredResponse): { appliedCount: number; ignoredFields: string[] } {
    let appliedCount = 0;
    const ignoredFields: string[] = [];

    if (result.intent.destinationType && this.state.destination.type !== result.intent.destinationType) {
      this.state.destination.type = result.intent.destinationType;
      if (result.intent.destinationType === 'messages') {
        this.state.destination.websiteUrl = '';
      }
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('campaign.name', this.state.campaign.name, '') && result.campaign.campaignName) {
      this.state.campaign.name = result.campaign.campaignName;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('campaign.objective', this.state.campaign.objective, this.initialState.campaign.objective)) {
      const nextObjective = this.isObjective(result.campaign.objective)
        ? result.campaign.objective
        : this.isObjective(result.intent.objective)
          ? result.intent.objective
          : null;
      if (nextObjective) {
        this.state.campaign.objective = nextObjective;
        appliedCount += 1;
      } else if (result.campaign.objective || result.intent.objective) {
        ignoredFields.push('Objetivo');
      }
    }

    if (this.shouldApplySuggestion('budget.budgetType', this.state.budget.budgetType, this.initialState.budget.budgetType)) {
      const nextBudgetType = result.campaign.budget?.type || result.intent.budgetType;
      if (nextBudgetType) {
        this.state.budget.budgetType = nextBudgetType;
        appliedCount += 1;
      }
    }

    if (this.shouldApplySuggestion('budget.value', this.state.budget.value, this.initialState.budget.value)) {
      const nextBudgetAmount = Number(result.campaign.budget?.amount ?? result.intent.budgetAmount ?? 0);
      if (nextBudgetAmount > 0) {
        this.state.budget.value = nextBudgetAmount;
        this.state.budget.quickBudget = nextBudgetAmount;
        appliedCount += 1;
      } else if (result.campaign.budget || result.intent.budgetAmount) {
        ignoredFields.push('Orçamento');
      }
    }

    appliedCount += this.applyStructuredTargeting(result.adSet.targeting, ignoredFields);

    if (this.shouldApplySuggestion('budget.optimizationGoal', this.state.budget.optimizationGoal, this.initialState.budget.optimizationGoal)) {
      if (result.adSet.optimizationGoal) {
        this.state.budget.optimizationGoal = result.adSet.optimizationGoal;
        appliedCount += 1;
      }
    }

    if (this.shouldApplySuggestion('budget.billingEvent', this.state.budget.billingEvent, this.initialState.budget.billingEvent)) {
      if (result.adSet.billingEvent) {
        this.state.budget.billingEvent = result.adSet.billingEvent;
        appliedCount += 1;
      }
    }

    if (this.shouldApplySuggestion('creative.message', this.state.creative.message, '') && result.creative.primaryText) {
      this.state.creative.message = result.creative.primaryText;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('creative.headline', this.state.creative.headline, '') && result.creative.headline) {
      this.state.creative.headline = result.creative.headline;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('creative.description', this.state.creative.description, '') && result.creative.description) {
      this.state.creative.description = result.creative.description;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('creative.cta', this.state.creative.cta, DEFAULT_CTA)) {
      const normalizedCta = this.normalizeAiCta(
        result.creative.cta || result.intent.cta || '',
        result.intent.destinationType || this.state.destination.type,
      );
      if (normalizedCta) {
        this.state.creative.cta = normalizedCta;
        appliedCount += 1;
      } else if (result.creative.cta) {
        ignoredFields.push('CTA');
      }
    }

    if (result.intent.destinationType === 'site' && this.shouldApplySuggestion('destination.websiteUrl', this.state.destination.websiteUrl, '')) {
      if (result.creative.destinationUrl && isSecureHttpUrl(result.creative.destinationUrl)) {
        this.state.destination.websiteUrl = result.creative.destinationUrl;
        appliedCount += 1;
      } else if (result.creative.destinationUrl) {
        ignoredFields.push('URL de destino');
      }
    } else if (result.intent.destinationType === 'messages' && this.state.destination.websiteUrl) {
      this.state.destination.websiteUrl = '';
    }

    if (this.shouldApplySuggestion('tracking.goals', this.state.tracking.goals, this.initialState.tracking.goals) && result.planner.goal) {
      this.state.tracking.goals = result.planner.goal;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('tracking.notes', this.state.tracking.notes, this.initialState.tracking.notes) && result.creative.imageSuggestion) {
      this.state.tracking.notes = `Sugestão de imagem da IA: ${result.creative.imageSuggestion}`;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('tracking.mainEvent', this.state.tracking.mainEvent, this.initialState.tracking.mainEvent)) {
      const nextEvent = defaultEventForObjective(result.campaign.objective || this.state.campaign.objective);
      if (nextEvent && this.state.tracking.mainEvent !== nextEvent) {
        this.state.tracking.mainEvent = nextEvent;
        appliedCount += 1;
      }
    }

    if (!this.state.identity.adAccountId && this.internalAdAccounts().length === 1) {
      this.state.identity.adAccountId = this.internalAdAccounts()[0].id;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('tracking.utmMedium', this.state.tracking.utmMedium, this.initialState.tracking.utmMedium)) {
      const nextMedium = this.state.destination.type === 'messages' ? 'click-to-message' : 'cpc';
      if (nextMedium && this.state.tracking.utmMedium !== nextMedium) {
        this.state.tracking.utmMedium = nextMedium;
        appliedCount += 1;
      }
    }

    this.syncAudienceLocationFromCurrentState(true);
    this.state.ui.aiLastSummary = result.review.summary || 'Sugestões geradas pela IA.';
    this.state.ui.aiDetectedFields = this.buildAiDetectedFields(result);
    this.state.ui.aiApplied = appliedCount > 0 || this.state.ui.aiDetectedFields.length > 0;

    return {
      appliedCount,
      ignoredFields: Array.from(new Set(ignoredFields)),
    };
  }

  private applyStructuredTargeting(targeting: AiTargetingOutput, ignoredFields: string[]): number {
    let appliedCount = 0;

    if (this.shouldApplySuggestion('audience.country', this.state.audience.country, this.initialState.audience.country)) {
      if (targeting.country && this.isValidCountry(targeting.country)) {
        this.state.audience.country = targeting.country;
        appliedCount += 1;
      } else if (targeting.country) {
        ignoredFields.push('País');
      }
    }

    appliedCount += this.applyStructuredAudienceLocation(targeting, ignoredFields);

    if (this.shouldApplySuggestion('audience.ageMin', this.state.audience.ageMin, this.initialState.audience.ageMin)) {
      if (typeof targeting.ageMin === 'number' && this.isValidAiAge(targeting.ageMin, targeting.ageMax)) {
        this.state.audience.ageMin = targeting.ageMin;
        appliedCount += 1;
      } else {
        ignoredFields.push('Idade mínima');
      }
    }

    if (this.shouldApplySuggestion('audience.ageMax', this.state.audience.ageMax, this.initialState.audience.ageMax)) {
      if (typeof targeting.ageMax === 'number' && this.isValidAiAge(targeting.ageMin, targeting.ageMax)) {
        this.state.audience.ageMax = targeting.ageMax;
        appliedCount += 1;
      } else {
        ignoredFields.push('Idade máxima');
      }
    }

    if (this.shouldApplySuggestion('audience.gender', this.state.audience.gender, 'ALL')) {
      const normalizedGender = this.mapStructuredGender(targeting.gender);
      if (normalizedGender) {
        this.state.audience.gender = normalizedGender;
        appliedCount += 1;
      } else if (targeting.gender) {
        ignoredFields.push('Gênero');
      }
    }

    if (!this.state.audience.interests.trim() && targeting.interests?.length) {
      this.state.audience.interests = targeting.interests.join(', ');
      appliedCount += 1;
    }

    if (!this.state.audience.excludedInterests.trim() && targeting.excludedInterests?.length) {
      this.state.audience.excludedInterests = targeting.excludedInterests.join(', ');
      appliedCount += 1;
    }

    if (!this.touchedFields()['placements.selected'] && targeting.placements?.length) {
      const placements = targeting.placements.filter((placement): placement is CampaignPlacement =>
        this.isPlacement(placement),
      );
      if (placements.length) {
        const currentPlacements = this.state.placements.selected.join(',');
        const nextPlacements = placements.join(',');
        if (currentPlacements !== nextPlacements) {
          this.state.placements.selected = placements;
          this.syncPlacementPlatforms(placements);
          appliedCount += 1;
        }
      } else {
        ignoredFields.push('Posicionamentos');
      }
    }

    return appliedCount;
  }

  private applyStructuredAudienceLocation(targeting: AiTargetingOutput, ignoredFields: string[]): number {
    const country = (targeting.country || this.state.audience.country || '').trim().toUpperCase();
    const city = this.normalizeStructuredLocationLabel(targeting.city);
    const stateOption = this.resolveStructuredStateOption(targeting.stateCode, targeting.state);
    let appliedCount = 0;

    if (country !== 'BR') {
      this.clearAiGeoPendingNotice();
      if (this.shouldApplySuggestion('audience.city', this.state.audience.city, this.initialState.audience.city) && city) {
        this.state.audience.city = city;
        this.state.audience.cityId = null;
        appliedCount += 1;
      }
      return appliedCount;
    }

    if ((targeting.stateCode || targeting.state) && !stateOption) {
      ignoredFields.push('UF');
    }

    if (stateOption) {
      const previousState = this.state.audience.state;
      const previousCity = this.state.audience.city;
      this.state.audience.state = stateOption.code;
      this.state.audience.stateName = stateOption.name;
      this.state.audience.region = stateOption.name;
      if (city) {
        this.state.audience.city = city;
        this.state.audience.cityId = null;
      } else if (previousState !== stateOption.code) {
        this.state.audience.city = '';
        this.state.audience.cityId = null;
      }
      if (previousState !== stateOption.code) {
        this.ibgeCities.set([]);
      }
      if (previousState !== stateOption.code || (city && previousCity !== city)) {
        appliedCount += 1;
      }
      this.clearAiGeoPendingNotice();
      this.loadIbgeCities(stateOption.code, !!city);
      return appliedCount;
    }

    if (city) {
      const message = 'A IA identificou a cidade, mas não conseguiu confirmar o estado. Selecione a UF para continuar.';
      this.state.ui.aiGeoPendingNotice = message;
      ignoredFields.push('Cidade sem UF confirmada');
      this.ui.showWarning('UF pendente', message);
    } else {
      this.clearAiGeoPendingNotice();
    }

    return appliedCount;
  }

  private normalizeStructuredAiCta(cta: string | null | undefined): MetaCallToActionType | null {
    if (!cta) return null;
    try {
      return parseCtaValue(cta) || null;
    } catch {
      return null;
    }
  }

  private mapStructuredGender(value: AiGender | null | undefined): CampaignGender | null {
    switch (value) {
      case 'male':
        return 'MALE';
      case 'female':
        return 'FEMALE';
      case 'all':
        return 'ALL';
      default:
        return null;
    }
  }

  private isValidAiAge(ageMin: number | null | undefined, ageMax: number | null | undefined): boolean {
    return typeof ageMin === 'number'
      && typeof ageMax === 'number'
      && ageMin >= 18
      && ageMax <= 65
      && ageMin <= ageMax;
  }

  private isPlacement(value: unknown): value is CampaignPlacement {
    return ['feed', 'stories', 'reels', 'explore', 'messenger', 'audience_network'].includes(String(value));
  }

  private resolveStructuredStateOption(stateCode: string | null, stateName: string | null): IbgeState | null {
    return this.findIbgeState(stateCode || stateName || '');
  }

  private normalizeStructuredLocationLabel(value: string | null | undefined): string {
    const normalized = (value || '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return '';
    }

    return normalized
      .split(' ')
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
      .join(' ');
  }

  private loadCreationContext(storeId: string): void {
    const requestId = ++this.contextRequestId;
    this.loadingContext.set(true);
    this.contextError.set(null);

    forkJoin({
      integration: this.api.getMetaIntegrationStatus(storeId),
      adAccounts: this.api.getAdAccounts(storeId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ integration, adAccounts }) => {
          if (requestId !== this.contextRequestId || storeId !== this.storeContext.getValidSelectedStoreId()) return;

          const metaAccounts = adAccounts.filter(
            (account) => account.provider === IntegrationProvider.META && account.active !== false,
          );

          this.integration.set(integration);
          this.internalAdAccounts.set(metaAccounts);
          this.state.identity.facebookPageId = integration.pageId || '';
          this.state.identity.displayName = this.state.identity.displayName || integration.pageName || '';
          this.state.identity.adAccountId = metaAccounts.some((account) => account.id === this.state.identity.adAccountId)
            ? this.state.identity.adAccountId
            : metaAccounts[0]?.id || '';
          this.loadingContext.set(false);
          this.touchState();
        },
        error: (err) => {
          if (requestId !== this.contextRequestId || storeId !== this.storeContext.getValidSelectedStoreId()) return;
          this.loadingContext.set(false);
          this.contextError.set(err.message || 'Não foi possível preparar o contexto de criação.');
        },
      });
  }

  private buildInitialState(): CampaignBuilderState {
    return buildInitialCampaignBuilderState();
  }

  private syncPlacementPlatforms(placements: CampaignPlacement[]): void {
    this.state.placements.platforms.facebook = placements.some((item) => ['feed', 'stories', 'reels'].includes(item));
    this.state.placements.platforms.instagram = placements.some((item) => ['feed', 'stories', 'reels', 'explore'].includes(item));
    this.state.placements.platforms.messenger = placements.includes('messenger');
    this.state.placements.platforms.audienceNetwork = placements.includes('audience_network');
  }

  private parsedList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private isIntegrationConnected(): boolean {
    return this.integration()?.status === IntegrationStatus.CONNECTED;
  }

  private hasConfiguredPage(): boolean {
    return hasConfiguredPage(this.integration());
  }

  private hasSyncedAdAccounts(): boolean {
    return hasSyncedAdAccounts(this.internalAdAccounts());
  }

  private realPayloadComplete(): boolean {
    return realPayloadComplete(this.state);
  }

  private generalSectionComplete(): boolean {
    return generalSectionComplete(this.state);
  }

  private identitySectionComplete(): boolean {
    return identitySectionComplete(this.reviewContext());
  }

  private audienceSectionComplete(): boolean {
    return audienceSectionComplete(this.state);
  }

  private budgetSectionComplete(): boolean {
    return budgetSectionComplete(this.state);
  }

  private scheduleSectionComplete(): boolean {
    return scheduleSectionComplete(this.state);
  }

  private placementSectionComplete(): boolean {
    return placementSectionComplete(this.state);
  }

  private destinationSectionComplete(): boolean {
    return destinationSectionComplete(this.state);
  }

  private creativeSectionComplete(): boolean {
    return creativeSectionComplete(this.state);
  }

  private trackingSectionComplete(): boolean {
    return trackingSectionComplete(this.state);
  }

  private isObjective(value: unknown): value is CampaignObjective {
    return ['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'REACH'].includes(String(value));
  }

  private isGender(value: unknown): value is CampaignGender {
    return ['ALL', 'MALE', 'FEMALE'].includes(String(value));
  }

  private isDestinationType(value: unknown): value is CampaignDestinationType {
    return ['site', 'messages', 'form', 'app', 'catalog'].includes(String(value));
  }

  private isValidCountry(value: string): boolean {
    return isValidCountry(value);
  }

  private isValidImageUrl(value: string): boolean {
    return isValidImageUrl(value);
  }

  private isValidHttpUrl(value: string): boolean {
    return isValidHttpUrl(value);
  }

  private shouldApplySuggestion(field: string, currentValue: unknown, defaultValue: unknown): boolean {
    if (this.touchedFields()[field]) {
      return false;
    }

    const current = typeof currentValue === 'string' ? currentValue.trim() : currentValue;
    const fallback = typeof defaultValue === 'string' ? defaultValue.trim() : defaultValue;
    return current === fallback || current === '' || current === null || current === undefined || current === 0;
  }

  private normalizeBuilderCta(
    value: unknown,
    destinationType: CampaignDestinationType = this.state.destination.type,
  ): MetaCallToActionType {
    if (typeof value !== 'string') {
      return destinationType === 'messages' ? 'MESSAGE_PAGE' : DEFAULT_CTA;
    }

    const parsedValue = parseCtaValue(value);
    if (parsedValue) {
      return parsedValue;
    }

    return this.normalizeAiCta(value, destinationType);
  }

  private normalizeAiCta(value: string, destinationType?: CampaignDestinationType): MetaCallToActionType {
    const parsedValue = parseCtaValue(value);
    if (parsedValue) {
      return parsedValue;
    }

    const normalized = normalizePromptText(value);
    const prefersMessages = destinationType === 'messages';

    if (/(whatsapp|falar|conversar|contato|contact|mensagem|message|messenger)/i.test(normalized)) {
      return prefersMessages ? 'MESSAGE_PAGE' : 'CONTACT_US';
    }
    if (/(comprar|buy|shop|oferta|promo)/i.test(normalized)) return 'SHOP_NOW';
    if (/(cadastro|lead|inscricao|inscrição|proposta|sign up)/i.test(normalized)) return 'SIGN_UP';
    if (/(agendar|marcar|reserva|booking)/i.test(normalized)) return 'BOOK_NOW';
    if (/(download|baixar)/i.test(normalized)) return 'DOWNLOAD';
    if (/(saiba|learn|more|detalhe|conheca|conheça)/i.test(normalized)) {
      return prefersMessages ? 'MESSAGE_PAGE' : 'LEARN_MORE';
    }

    // If messages destination and nothing matched, default to MESSAGE_PAGE
    if (prefersMessages) {
      return 'MESSAGE_PAGE';
    }

    // Final fallback to LEARN_MORE
    return DEFAULT_CTA;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  }

  formatCtaForDisplay(suggestionCtaText: string): string {
    if (!suggestionCtaText) return 'Saiba mais';
    return getCtaLabelByValue(this.normalizeBuilderCta(suggestionCtaText, this.state.destination.type));
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private draftStorageKey(): string {
    return `metaiq.campaign-builder.v2.${this.storeContext.getValidSelectedStoreId() || 'global'}`;
  }

  private reviewVisitedStorageKey(): string {
    return `metaiq.campaign-builder.review-visited.${this.storeContext.getValidSelectedStoreId() || 'global'}`;
  }

  private persistDraft(showToast: boolean): void {
    if (!this.hasMeaningfulInput()) {
      return;
    }

    localStorage.setItem(this.draftStorageKey(), JSON.stringify(this.buildExpandedCampaignState()));
    this.draftAvailable.set(true);
    this.autosaveState.set('saved');
    this.lastSavedAt.set(new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()));

    if (this.saveIndicatorTimer) {
      window.clearTimeout(this.saveIndicatorTimer);
    }

    this.saveIndicatorTimer = window.setTimeout(() => {
      this.autosaveState.set('idle');
    }, 2200);

    if (showToast) {
      this.ui.showSuccess('Rascunho salvo', 'O estado atual foi salvo localmente neste navegador.');
    }
  }

  private scheduleAutosave(): void {
    if (!this.hasMeaningfulInput()) {
      return;
    }

    this.autosaveState.set('saving');

    if (this.autosaveTimer) {
      window.clearTimeout(this.autosaveTimer);
    }

    this.autosaveTimer = window.setTimeout(() => {
      this.persistDraft(false);
    }, 900);
  }

  private hasMeaningfulInput(): boolean {
    return !!(
      this.state.campaign.name.trim()
      || this.state.ui.aiPrompt.trim()
      || !!this.state.ui.aiLastSuggestion
      || this.state.creative.message.trim()
      || this.state.creative.imageAssetId.trim()
      || this.state.creative.imageUrl.trim()
      || this.state.destination.websiteUrl.trim()
      || this.state.audience.city.trim()
      || this.state.audience.interests.trim()
      || this.state.tracking.pixel.trim()
    );
  }

  private syncDraftAvailability(): void {
    this.draftAvailable.set(!!localStorage.getItem(this.draftStorageKey()));
  }

  private markReviewVisited(): void {
    localStorage.setItem(this.reviewVisitedStorageKey(), '1');
  }

  private applyPendingLaunchIntent(): void {
    if (!this.storeContext.loaded()) {
      return;
    }

    if (this.pendingDraftRestore()) {
      this.pendingDraftRestore.set(false);
      if (localStorage.getItem(this.draftStorageKey())) {
        this.restoreDraftFromLocalStorage(false);
      }
    }

    const target = this.pendingInitialTarget();
    if (!target) {
      return;
    }

    this.pendingInitialTarget.set(null);

    if (target === 'review') {
      this.reviewNow();
      return;
    }

    this.switchToManualMode();
    this.scrollToSection('builder-lite');
  }

  private restoreDraftFromLocalStorage(showToast: boolean): void {
    const raw = localStorage.getItem(this.draftStorageKey());
    if (!raw) {
      if (showToast) {
        this.ui.showInfo('Sem rascunho', 'Nenhum rascunho local foi encontrado para esta store.');
      }
      return;
    }

    try {
      const draft = JSON.parse(raw) as CampaignBuilderState;
      const nextState: CampaignBuilderState = {
        ...this.buildInitialState(),
        ...draft,
        campaign: { ...this.buildInitialState().campaign, ...draft.campaign },
        identity: { ...this.buildInitialState().identity, ...draft.identity },
        audience: { ...this.buildInitialState().audience, ...draft.audience },
        budget: { ...this.buildInitialState().budget, ...draft.budget },
        schedule: { ...this.buildInitialState().schedule, ...draft.schedule },
        placements: {
          ...this.buildInitialState().placements,
          ...draft.placements,
          platforms: {
            ...this.buildInitialState().placements.platforms,
            ...draft.placements?.platforms,
          },
        },
        destination: { ...this.buildInitialState().destination, ...draft.destination },
        creative: { ...this.buildInitialState().creative, ...draft.creative },
        tracking: { ...this.buildInitialState().tracking, ...draft.tracking },
        ui: { ...this.buildInitialState().ui, ...draft.ui },
      };
      nextState.creative.cta = this.normalizeBuilderCta(
        draft?.creative?.cta ?? nextState.creative.cta,
        nextState.destination.type,
      );
      this.state = nextState;
      this.syncAudienceLocationFromCurrentState(true);
      const restoredEntryMode = this.state.ui.builderMode || (this.state.ui.aiLastSuggestion ? 'ai' : 'manual');
      this.creationEntryMode.set(restoredEntryMode);
      this.creationMode.set(this.state.ui.aiFlowMode || (restoredEntryMode === 'ai' ? 'ai-entry' : 'edit-lite'));
      this.draftRestored.set(true);
      this.draftAvailable.set(true);
      this.autosaveState.set('saved');
      this.touchState();
      if (showToast) {
        this.ui.showSuccess('Rascunho restaurado', 'O último estado salvo foi restaurado com sucesso.');
      }
    } catch {
      if (showToast) {
        this.ui.showError('Rascunho inválido', 'Não foi possível restaurar o rascunho salvo.');
      }
    }
  }

  private formatCampaignCreationError(err: any): string {
    return this.normalizeCampaignCreationError(err).message;
  }

  private normalizeCampaignCreationError(err: any): MetaCampaignCreationError {
    const backendError = err?.error && typeof err.error === 'object' ? err.error : null;
    const details = backendError
      ?? (err?.details && typeof err.details === 'object' ? err.details : err);
    const step = this.normalizeMetaStep(err?.step ?? details?.step);
    const executionStatus = this.normalizeMetaExecutionStatus(
      err?.executionStatus ?? details?.executionStatus ?? details?.status,
    );
    const executionId = this.extractString(err?.executionId ?? details?.executionId ?? details?.id);
    const partialIds = this.normalizeMetaPartialIds(err?.partialIds ?? details?.partialIds ?? details?.ids);
    const hint = this.extractString(err?.hint ?? details?.hint);
    const metaError = this.normalizeMetaError(err?.metaError ?? details?.metaError);
    const blockingIssues = this.normalizeStringArray(err?.blockingIssues ?? details?.blockingIssues);
    const baseMessage = this.extractString(err?.message ?? details?.message)
      || 'Nao foi possivel criar a campanha na Meta.';

    return {
      message: baseMessage,
      step,
      executionId,
      executionStatus,
      partialIds,
      hint,
      metaError,
      blockingIssues,
    };
  }

  private normalizeMetaStep(value: unknown): MetaCampaignExecutionStep | undefined {
    return ['campaign', 'adset', 'creative', 'ad', 'persist'].includes(String(value))
      ? value as MetaCampaignExecutionStep
      : undefined;
  }

  private normalizeMetaExecutionStatus(value: unknown): MetaCampaignExecutionStatus | undefined {
    return ['PARTIAL', 'PARTIAL_ROLLBACK', 'FAILED', 'CLEANUP_FAILED', 'IN_PROGRESS', 'COMPLETED'].includes(String(value))
      ? value as MetaCampaignExecutionStatus
      : undefined;
  }

  private normalizeMetaPartialIds(value: unknown): MetaCampaignPartialIds | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const ids = value as Record<string, unknown>;
    const normalized: MetaCampaignPartialIds = {
      campaignId: this.extractString(ids['campaignId'] ?? ids['campaign']),
      adSetId: this.extractString(ids['adSetId'] ?? ids['adset']),
      creativeId: this.extractString(ids['creativeId'] ?? ids['creative']),
      adId: this.extractString(ids['adId'] ?? ids['ad']),
    };

    return Object.values(normalized).some(Boolean) ? normalized : undefined;
  }

  private normalizeMetaError(value: unknown): MetaCampaignErrorDetails | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const metaError = value as Record<string, unknown>;
    const normalized: MetaCampaignErrorDetails = {
      message: this.extractString(metaError['message']),
      code: typeof metaError['code'] === 'string' || typeof metaError['code'] === 'number' ? metaError['code'] : undefined,
      subcode: typeof metaError['subcode'] === 'string' || typeof metaError['subcode'] === 'number' ? metaError['subcode'] : undefined,
      userTitle: this.extractString(metaError['userTitle']),
      userMessage: this.extractString(metaError['userMessage']),
    };

    return Object.values(normalized).some((entry) => entry != null && entry !== '') ? normalized : undefined;
  }

  private extractString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private normalizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const normalized = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);

    return normalized.length ? normalized : undefined;
  }

  private currentPayloadSignature(): string {
    return JSON.stringify(this.buildApiPayload());
  }

  private applyIndividualBusinessDefaults(): void {
    if (!this.accountContext.isIndividualAccount()) {
      return;
    }

    const profile = this.companyProfile.profile();
    const profileState = profile.state.trim().toUpperCase();
    const regionLabel = [profile.city.trim(), profileState].filter(Boolean).join(' / ');

    if (!this.state.audience.city.trim() && profile.city.trim()) {
      this.state.audience.city = profile.city.trim();
    }

    if (!this.state.audience.state.trim() && profileState) {
      this.state.audience.state = profileState;
      this.state.audience.stateName = profileState;
      this.state.audience.region = profileState;
    }

    if (!this.state.destination.websiteUrl.trim() && profile.website.trim()) {
      this.state.destination.websiteUrl = profile.website.trim();
    }

    if (!this.state.identity.instagramAccount.trim() && profile.instagram.trim()) {
      this.state.identity.instagramAccount = profile.instagram.trim();
    }

    if (!this.state.ui.aiRegion.trim() && regionLabel) {
      this.state.ui.aiRegion = regionLabel;
    }

    if (!this.state.ui.aiExtraContext.trim()) {
      this.state.ui.aiExtraContext = [
        profile.businessName.trim() ? `Empresa ${profile.businessName.trim()}` : '',
        profile.businessSegment.trim() ? `segmento ${profile.businessSegment.trim()}` : '',
        profile.whatsapp.trim() ? `contato ${profile.whatsapp.trim()}` : '',
      ].filter(Boolean).join(', ');
    }
  }

  private clearSubmissionFailure(): void {
    this.submitFailure.set(null);
    this.partialExecutionSignature.set(null);
    this.technicalErrorOpen.set(false);
  }

  private mapRecoverySuccessToCreateResponse(
    storeId: string,
    response: MetaCampaignRecoveryResponse,
  ): CreateMetaCampaignResponse {
    const ids = response.ids || response.partialIds || {};

    return {
      executionId: response.executionId,
      campaignId: ids.campaignId || '',
      adSetId: ids.adSetId || '',
      creativeId: ids.creativeId || '',
      adId: ids.adId || '',
      status: 'CREATED',
      executionStatus: 'COMPLETED',
      initialStatus: this.state.campaign.initialStatus,
      storeId,
      adAccountId: this.state.identity.adAccountId,
      platform: 'META',
      step: response.step,
      partialIds: response.partialIds,
      hint: response.hint,
    };
  }

  private metaFrontendValidationMessage(): string | null {
    if (this.hasAiBlockingIssues()) {
      return 'Corrija os problemas obrigatórios antes de enviar a campanha.';
    }

    if (this.state.ui.aiGeoPendingNotice) {
      return this.state.ui.aiGeoPendingNotice;
    }

    if (this.isIntegrationConnected() && !this.hasConfiguredPage()) {
      return 'Configure a Pagina do Facebook da loja antes de criar campanhas.';
    }

    if (this.state.destination.type !== 'site') {
      return META_MESSAGES_PUBLISH_SCOPE_MESSAGE;
    }

    if (this.state.destination.type === 'site' && !this.state.destination.websiteUrl.trim()) {
      return 'Use uma URL final segura comecando com https://.';
    }

    if (this.state.destination.type === 'site' && !isSecureHttpUrl(this.state.destination.websiteUrl)) {
      return 'Use uma URL final segura comecando com https://.';
    }

    if (!this.state.creative.message.trim()) {
      return 'Preencha a mensagem principal do criativo antes de enviar.';
    }

    if (!this.state.creative.headline.trim()) {
      return 'Preencha a headline do criativo antes de enviar.';
    }

    if (!this.state.creative.imageAssetId.trim()) {
      return 'Envie uma imagem válida para continuar.';
    }

    if (!(Number(this.state.budget.value) > 0)) {
      return 'Informe um daily budget valido para criar a campanha.';
    }

    if (!isValidCountry(this.state.audience.country)) {
      return 'Selecione um pais valido antes de criar a campanha.';
    }

    if (!this.state.placements.selected.length) {
      return 'Selecione pelo menos um posicionamento antes de publicar.';
    }

    if (!this.state.tracking.mainEvent.trim()) {
      return 'Defina o evento principal de rastreamento antes de publicar.';
    }

    if (this.state.campaign.objective === 'OUTCOME_LEADS' && !this.state.tracking.pixel.trim()) {
      return 'Campanhas de leads exigem pixel configurado antes da publicação.';
    }

    return null;
  }

  private loadIbgeStates(): void {
    if (this.loadingIbgeStates() || this.ibgeStates().length) {
      return;
    }

    this.loadingIbgeStates.set(true);
    this.ibgeError.set(null);

    this.api.getIbgeStates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (states) => {
          this.ibgeStates.set(states);
          this.loadingIbgeStates.set(false);
          this.syncAudienceLocationFromCurrentState(true);
        },
        error: (err) => {
          this.loadingIbgeStates.set(false);
          this.ibgeError.set(err.message || 'Não foi possível carregar os estados do IBGE.');
        },
      });
  }

  private loadIbgeCities(uf: string, preserveSelection = false): void {
    const normalizedUf = (uf || '').trim().toUpperCase();
    if (!normalizedUf) {
      this.ibgeCities.set([]);
      return;
    }

    this.ibgeCitiesRequestUf = normalizedUf;
    this.loadingIbgeCities.set(true);
    this.ibgeError.set(null);

    this.api.getIbgeCities(normalizedUf)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cities) => {
          if (this.ibgeCitiesRequestUf !== normalizedUf) {
            return;
          }
          this.ibgeCities.set(cities);
          this.loadingIbgeCities.set(false);

          if (preserveSelection) {
            const cityOption = this.findIbgeCity(this.state.audience.city, this.state.audience.cityId);
            if (cityOption) {
              this.state.audience.city = cityOption.name;
              this.state.audience.cityId = cityOption.id;
              this.refreshAiGeoPendingNotice();
              this.touchState();
              return;
            }
          }

          if (!cities.some((item) => item.id === this.state.audience.cityId || item.name === this.state.audience.city)) {
            this.state.audience.city = '';
            this.state.audience.cityId = null;
            this.refreshAiGeoPendingNotice();
            this.touchState();
          }
        },
        error: (err) => {
          if (this.ibgeCitiesRequestUf !== normalizedUf) {
            return;
          }
          this.loadingIbgeCities.set(false);
          this.ibgeCities.set([]);
          this.ibgeError.set(err.message || 'Não foi possível carregar as cidades da UF selecionada.');
        },
      });
  }

  private syncAudienceLocationFromCurrentState(loadCities = false): void {
    const stateOption = this.findIbgeState(
      this.state.audience.state || this.state.audience.stateName || this.state.audience.region,
    );

    if (stateOption) {
      this.state.audience.state = stateOption.code;
      this.state.audience.stateName = stateOption.name;
      this.state.audience.region = stateOption.name;

      if (loadCities) {
        this.loadIbgeCities(stateOption.code, true);
      }
      this.refreshAiGeoPendingNotice();
      return;
    }

    if (!this.state.audience.stateName.trim() && this.state.audience.region.trim()) {
      this.state.audience.stateName = this.state.audience.region.trim();
    }
  }

  private clearAiGeoPendingNotice(): void {
    this.state.ui.aiGeoPendingNotice = null;
  }

  private refreshAiGeoPendingNotice(): void {
    if (!this.state.ui.aiGeoPendingNotice) {
      return;
    }

    const hasValidBrazilianGeo = this.state.audience.country.trim().toUpperCase() !== 'BR'
      || (!!this.state.audience.state.trim() && !!this.state.audience.cityId);

    if (hasValidBrazilianGeo) {
      this.clearAiGeoPendingNotice();
    }
  }

  private findIbgeState(value: string): IbgeState | null {
    const normalized = this.normalizeLocationToken(value);
    if (!normalized) {
      return null;
    }

    return this.ibgeStates().find((item) =>
      this.normalizeLocationToken(item.code) === normalized || this.normalizeLocationToken(item.name) === normalized,
    ) || null;
  }

  private findIbgeCity(cityName: string, cityId: number | null): IbgeCity | null {
    if (cityId) {
      const byId = this.ibgeCities().find((item) => item.id === cityId);
      if (byId) return byId;
    }

    const normalizedName = this.normalizeLocationToken(cityName);
    if (!normalizedName) {
      return null;
    }

    return this.ibgeCities().find((item) => this.normalizeLocationToken(item.name) === normalizedName) || null;
  }

  private normalizeLocationToken(value: string | null | undefined): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private isAiFailureResponse(
    result: CampaignSuggestionResponse | CampaignCopilotAnalysisResponse | CampaignAiFailureResponse,
  ): result is CampaignAiFailureResponse {
    return result?.status === 'AI_FAILED' || result?.status === 'AI_NEEDS_RETRY';
  }

  canApplyAiSuggestion(result: CampaignAiStructuredResponse): boolean {
    if (result.review.confidence < 60) return false;
    if (result.meta?.responseValid === false) return false;
    if (result.meta?.usedFallback) return false;
    if (result.meta?.consistencyApproved === false) return false;
    if (result.validation.blockingIssues.length) return false;
    if (!result.campaign.campaignName?.trim()) return false;
    if (!result.creative.primaryText?.trim()) return false;
    if (!result.creative.headline?.trim()) return false;
    if (this.containsJsonArtifact(result.creative.primaryText)
      || this.containsJsonArtifact(result.creative.headline)
      || this.containsJsonArtifact(result.strategy)) {
      return false;
    }
    return true;
  }

  canApplySuggestionToDraft(result: CampaignAiStructuredResponse): boolean {
    if (result.review.confidence < 45) return false;
    if (result.meta?.responseValid === false) return false;
    if (result.meta?.usedFallback) return false;
    if (!result.campaign.campaignName?.trim()) return false;
    if (!result.creative.primaryText?.trim()) return false;
    if (!result.creative.headline?.trim()) return false;
    if (this.containsJsonArtifact(result.creative.primaryText)
      || this.containsJsonArtifact(result.creative.headline)
      || this.containsJsonArtifact(result.strategy)) {
      return false;
    }
    return true;
  }

  private containsJsonArtifact(value: string | null | undefined): boolean {
    const text = String(value || '').trim();
    if (!text) return false;
    return /```|^\s*[{[]|"\w+"\s*:|[}\]]\s*$/.test(text);
  }
}

export type { CampaignCreateSuccessEvent } from './campaign-builder.types';

