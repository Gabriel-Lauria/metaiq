import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, HostListener, Input, Output, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import {
  AdAccount,
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
  buildSimulatedMetrics,
  buildSummaryRows,
  buildReadinessItems,
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
  CampaignBuilderUndoSnapshot,
  CampaignObjective,
  CampaignPlacement,
  CreationReadinessItem,
  ReviewSignal,
  SectionProgress,
  SuccessOverlayState,
  SummaryRow,
} from './campaign-builder.types';
import {
  CTA_OPTIONS,
  DEFAULT_CTA,
  getCtaLabelByValue,
  parseCtaValue,
  type MetaCallToActionType,
} from './cta.constants';
import { CreativePreviewComponent } from './creative-preview.component';
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
  imports: [CommonModule, FormsModule, UiBadgeComponent, CreativePreviewComponent, CampaignBuilderStepperComponent],
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
    { value: 'ACTIVE', label: 'Ativa' },
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
        'configuration': 'Configuração',
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

  readonly simulatedMetrics = computed(() => {
    this.revision();
    return buildSimulatedMetrics(this.state);
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
        value: qualityAvailable ? `${qualityScore}/100` : '—',
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
        expandedState: this.buildExpandedCampaignState(),
        apiPayload: this.buildApiPayload(),
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

  setInitialStatus(value: CampaignInitialStatus): void {
    this.state.campaign.initialStatus = value;
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

    this.aiSuggesting.set(true);

    this.campaignAiService.suggest(this.buildAiSuggestionRequest(prompt, storeId))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.aiSuggesting.set(false);
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
          this.ui.showSuccess(
            'Sugestão pronta para revisão',
            'A IA montou uma primeira versão. Revise antes de aplicar ao builder.',
          );
          this.scrollToSection('builder-ai-result');
        },
        error: (error) => {
          this.aiSuggesting.set(false);
          this.state.ui.aiCreativeIdeas = [];
          this.state.ui.aiConfidence = 20;
          this.state.ui.aiStrengths = [];
          this.state.ui.aiAssumptions = ['Fallback local aplicado sem consultar a IA externa.'];
          this.state.ui.aiMissingInputs = ['Contexto validado pela IA indisponível no momento.'];
          this.state.ui.aiRiskWarnings = ['Revise todas as sugestões antes de publicar.'];
          this.state.ui.aiRecommendations = ['Preencha os campos principais manualmente no builder antes de enviar para a Meta.'];
          this.state.ui.aiValidationReady = false;
          this.state.ui.aiQualityScore = 40;
          this.state.ui.aiBlockingIssues = ['Não foi possível validar a campanha automaticamente.'];
          this.state.ui.aiValidationWarnings = [];
          this.state.ui.aiValidationRecommendations = ['Revise manualmente antes de enviar.'];
          this.state.ui.aiValidationStale = false;
          this.state.ui.aiIgnoredFields = [];
          this.state.ui.aiUsedFallback = true;
          this.state.ui.aiLastSuggestion = null;
          this.touchState(false);
          this.ui.showWarning(
            'IA indisponível no momento',
            error?.message || 'Não foi possível gerar sugestões agora. O builder avançado continua disponível para criação manual.',
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

  applyCurrentAiSuggestion(): void {
    const result = this.state.ui.aiLastSuggestion;
    const prompt = this.state.ui.aiPrompt.trim();
    if (!result) {
      this.ui.showWarning('Sem sugestão para aplicar', 'Gere uma sugestão com IA antes de preencher o builder.');
      this.switchToAiMode();
      return;
    }

    this.clearAiGeoPendingNotice();
    const { appliedCount, ignoredFields } = this.applyStructuredAiSuggestion(result);
    this.state.ui.aiCreativeIdeas = result.creative.imageSuggestion ? [result.creative.imageSuggestion] : [];
    this.applyAiTrustMetadata(result);
    this.state.ui.aiIgnoredFields = ignoredFields;
    this.state.ui.aiApplied = true;
    this.state.ui.aiValidationStale = false;
    this.setCreationMode('edit-lite', false);
    this.touchState(false);
    this.ui.showSuccess(
      'Sugestão aplicada ao rascunho',
      appliedCount > 0
        ? `${appliedCount} campos foram preenchidos. Revise e ajuste antes de criar na Meta.`
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
    return '✨ Sugerir com IA';
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

    if (!isLikelyDirectImageUrl(this.state.creative.imageUrl)) {
      problems.add('Adicione uma imagem válida para o criativo.');
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

    if (!this.state.tracking.pixel.trim()) {
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
    this.submitAttempted.set(true);
    this.touchState(false);

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

    this.api.createMetaCampaign(storeId, this.buildApiPayload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
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
          const failure = this.normalizeCampaignCreationError(err);
          const message = failure.message;
          this.submitFailure.set(failure);
          this.partialExecutionSignature.set(
            failure.executionStatus === 'PARTIAL' ? this.currentPayloadSignature() : null,
          );
          this.submitError.set(message);
          this.submitting.set(false);
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

    this.api.retryMetaCampaignRecovery(storeId, failure.executionId, this.buildApiPayload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.recoverySubmitting.set(false);
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
          this.recoverySubmitting.set(false);
          this.technicalErrorOpen.set(false);
          this.ui.showError('Nao foi possivel continuar a criacao', nextFailure.message);
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
    return buildApiPayload(this.state);
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
    const expandedFields = [
      this.state.campaign.specialCategory,
      this.state.campaign.buyingType,
      this.state.campaign.campaignSpendLimit,
      this.state.campaign.abTest,
      this.state.campaign.campaignBudgetOptimization,
      this.state.audience.city,
      this.state.audience.interests,
      this.state.placements.selected.length,
      this.state.schedule.weekDays.length,
      this.state.tracking.pixel,
      this.state.tracking.utmCampaign,
    ].some(Boolean);
    const base = this.state.campaign.initialStatus === 'ACTIVE'
      ? 'Payload real: a campanha será enviada tentando respeitar o status inicial ativo, sujeito às validações da Meta.'
      : 'Payload real: a campanha será enviada pausada quando o status inicial estiver definido como pausada.';

    if (expandedFields) {
      return `${base} Campos avançados de público, agenda, posicionamento e rastreamento ficam registrados na revisão expandida, mas ainda não são aplicados pela API Meta atual.`;
    }

    return this.state.campaign.initialStatus === 'ACTIVE'
      ? base
      : base;
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
    return !this.canSubmit() || this.recoverySubmitting() || this.normalSubmitBlocked() || this.submitting();
  }

  submitButtonLabel(): string {
    if (this.recoverySubmitting()) return 'Continuando criacao na Meta...';
    if (this.submitting()) return 'Criando campanha na Meta...';
    if (this.normalSubmitBlocked()) return 'Use o recovery seguro';
    return 'Criar na Meta';
  }

  metaCreationLoadingLabel(): string {
    if (this.recoverySubmitting()) {
      return 'Continuando criacao parcial com o fluxo seguro da Meta...';
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
      budget: this.state.ui.aiBudget || this.state.budget.value || undefined,
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
          confidence: Math.max(0, Math.min(100, Number(item?.confidence ?? result.analysis?.confidence ?? 0))),
        })),
        confidence: Math.max(0, Math.min(100, Number(result.analysis?.confidence ?? 0))),
      },
    };
  }

  private applyAiTrustMetadata(result: CampaignSuggestionResponse): void {
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
    return Math.max(0, Math.min(100, Number(this.aiCopilotAnalysis()?.confidence ?? 0)));
  }

  aiCopilotStatusLabel(): string {
    if (this.state.ui.aiCopilotStale) {
      return 'Análise desatualizada';
    }
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
    return analysis.issues[0] || analysis.improvements[0]?.description || 'A campanha está pronta para ajustes finos antes do envio.';
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
      return parts.join(' • ') || improvement.description;
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
    return this.aiValidation()?.isReadyToPublish && !this.state.ui.aiValidationStale ? 'success' : 'danger';
  }

  aiValidationStatusLabel(): string {
    if (this.state.ui.aiValidationStale) {
      return 'Validação desatualizada';
    }
    return this.aiValidation()?.isReadyToPublish ? 'Pronta para publicação' : 'Revisão necessária antes de publicar';
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
    if (!isLikelyDirectImageUrl(this.state.creative.imageUrl)) issues.add('imagem');
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

  private buildAiDetectedFields(result: CampaignSuggestionResponse): string[] {
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

  private applyStructuredAiSuggestion(result: CampaignSuggestionResponse): { appliedCount: number; ignoredFields: string[] } {
    let appliedCount = 0;
    const ignoredFields: string[] = [];

    if (this.shouldApplySuggestion('campaign.name', this.state.campaign.name, '') && result.campaign.campaignName) {
      this.state.campaign.name = result.campaign.campaignName;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('campaign.objective', this.state.campaign.objective, this.initialState.campaign.objective)) {
      if (this.isObjective(result.campaign.objective)) {
        this.state.campaign.objective = result.campaign.objective;
        appliedCount += 1;
      } else {
        ignoredFields.push('Objetivo');
      }
    }

    if (this.shouldApplySuggestion('budget.budgetType', this.state.budget.budgetType, this.initialState.budget.budgetType) && result.campaign.budget?.type) {
      this.state.budget.budgetType = result.campaign.budget.type;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('budget.value', this.state.budget.value, this.initialState.budget.value)) {
      if ((result.campaign.budget?.amount || 0) > 0) {
        this.state.budget.value = Number(result.campaign.budget.amount);
        this.state.budget.quickBudget = Number(result.campaign.budget.amount);
        appliedCount += 1;
      } else if (result.campaign.budget) {
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
      const normalizedCta = this.normalizeStructuredAiCta(result.creative.cta);
      if (normalizedCta) {
        this.state.creative.cta = normalizedCta;
        appliedCount += 1;
      } else if (result.creative.cta) {
        ignoredFields.push('CTA');
      }
    }

    if (this.shouldApplySuggestion('destination.websiteUrl', this.state.destination.websiteUrl, '')) {
      if (result.creative.destinationUrl && isSecureHttpUrl(result.creative.destinationUrl)) {
        this.state.destination.websiteUrl = result.creative.destinationUrl;
        appliedCount += 1;
      } else if (result.creative.destinationUrl) {
        ignoredFields.push('URL de destino');
      }
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

    if (!this.state.placements.selected.length && targeting.placements?.length) {
      const placements = targeting.placements.filter((placement): placement is CampaignPlacement =>
        this.isPlacement(placement),
      );
      if (placements.length) {
        this.state.placements.selected = placements;
        this.syncPlacementPlatforms(placements);
        appliedCount += 1;
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
    const details = err?.details && typeof err.details === 'object' ? err.details : err;
    const step = this.normalizeMetaStep(err?.step ?? details?.step);
    const executionStatus = this.normalizeMetaExecutionStatus(
      err?.executionStatus ?? details?.executionStatus ?? details?.status,
    );
    const executionId = this.extractString(err?.executionId ?? details?.executionId ?? details?.id);
    const partialIds = this.normalizeMetaPartialIds(err?.partialIds ?? details?.partialIds ?? details?.ids);
    const hint = this.extractString(err?.hint ?? details?.hint);
    const metaError = this.normalizeMetaError(err?.metaError ?? details?.metaError);
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
    };
  }

  private normalizeMetaStep(value: unknown): MetaCampaignExecutionStep | undefined {
    return ['campaign', 'adset', 'creative', 'ad', 'persist'].includes(String(value))
      ? value as MetaCampaignExecutionStep
      : undefined;
  }

  private normalizeMetaExecutionStatus(value: unknown): MetaCampaignExecutionStatus | undefined {
    return ['PARTIAL', 'FAILED', 'IN_PROGRESS', 'COMPLETED'].includes(String(value))
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

    if (!isLikelyDirectImageUrl(this.state.creative.imageUrl)) {
      return 'A imagem precisa estar acessivel publicamente ou ser enviada em formato aceito pela Meta.';
    }

    if (!(Number(this.state.budget.value) > 0)) {
      return 'Informe um daily budget valido para criar a campanha.';
    }

    if (!isValidCountry(this.state.audience.country)) {
      return 'Selecione um pais valido antes de criar a campanha.';
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
}

export type { CampaignCreateSuccessEvent } from './campaign-builder.types';
