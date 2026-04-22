import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, HostListener, Output, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import {
  AdAccount,
  CampaignAiSuggestResponse,
  CampaignSuggestionResponse,
  CreateMetaCampaignRequest,
  IntegrationProvider,
  IntegrationStatus,
  StoreIntegration,
} from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';
import { CampaignAiService } from './campaign-ai.service';
import {
  buildAiDescriptionForObjective,
  buildAiHeadlineForState,
  buildAiMessageForState,
  defaultEventForObjective,
  detectBillingEventFromPrompt,
  detectBudgetTypeFromPrompt,
  detectCityFromPrompt,
  detectConversionWindowFromPrompt,
  detectCountryFromPrompt,
  detectCtaFromPrompt,
  detectGenderFromPrompt,
  detectInitialStatusFromPrompt,
  detectInterestFallbackFromPrompt,
  detectObjectiveFromPrompt,
  detectOptimizationGoalFromPrompt,
  detectPlacementsFromPrompt,
  detectPrimaryLanguageFromPrompt,
  detectRegionFromPrompt,
  detectSpecialCategoryFromPrompt,
  detectWeekDaysFromPrompt,
  extractBudgetFromPrompt,
  normalizeDetectedCity,
  normalizePromptText,
  parsePromptDecimal,
  toPromptTitleCase,
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
  CampaignCreateSuccessEvent,
  CampaignDestinationType,
  CampaignGender,
  CampaignInitialStatus,
  CampaignObjective,
  CampaignPlacement,
  CreationReadinessItem,
  PromptExtractionResult,
  ReviewSignal,
  SectionProgress,
  SuccessOverlayState,
  SummaryRow,
} from './campaign-builder.types';

@Component({
  selector: 'app-campaign-create-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, UiBadgeComponent],
  templateUrl: './campaign-create-panel.component.html',
  styleUrls: ['./campaign-create-panel.component.scss'],
})
export class CampaignCreatePanelComponent {
  private api = inject(ApiService);
  private campaignAiService = inject(CampaignAiService);
  private router = inject(Router);
  private ui = inject(UiService);
  private destroyRef = inject(DestroyRef);
  readonly storeContext = inject(StoreContextService);

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<CampaignCreateSuccessEvent>();

  readonly objectiveOptions: Array<{ value: CampaignObjective; label: string; hint: string }> = [
    { value: 'OUTCOME_TRAFFIC', label: 'Tráfego', hint: 'Levar mais visitas para o destino escolhido.' },
    { value: 'OUTCOME_LEADS', label: 'Leads', hint: 'Capturar novos contatos com foco em intenção.' },
    { value: 'REACH', label: 'Alcance', hint: 'Maximizar cobertura com controle operacional simples.' },
  ];
  readonly ctaOptions = ['Saiba mais', 'Comprar agora', 'Fale conosco', 'Quero oferta', 'Enviar mensagem'];
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
  readonly submitError = signal<string | null>(null);
  readonly integration = signal<StoreIntegration | null>(null);
  readonly internalAdAccounts = signal<AdAccount[]>([]);
  readonly revision = signal(0);
  readonly submitAttempted = signal(false);
  readonly aiSuggesting = signal(false);
  readonly draftRestored = signal(false);
  readonly draftAvailable = signal(false);
  readonly autosaveState = signal<'idle' | 'saving' | 'saved'>('idle');
  readonly lastSavedAt = signal<string | null>(null);
  readonly activeSection = signal('builder-general');
  readonly audienceAdvancedOpen = signal(false);
  readonly budgetAdvancedOpen = signal(false);
  readonly scheduleAdvancedOpen = signal(false);
  readonly placementAdvancedOpen = signal(false);
  readonly touchedFields = signal<Record<string, boolean>>({});
  readonly successOverlay = signal<SuccessOverlayState | null>(null);
  readonly previewImageFailed = signal(false);
  readonly closeConfirmOpen = signal(false);
  readonly technicalReviewOpen = signal(false);

  state: CampaignBuilderState = this.buildInitialState();
  private readonly initialState = this.buildInitialState();

  private contextRequestId = 0;
  private autosaveTimer: number | null = null;
  private saveIndicatorTimer: number | null = null;
  private pendingCreatedEvent: CampaignCreateSuccessEvent | null = null;

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

  constructor() {
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
        this.state.identity.facebookPageId = '';

        if (requestedStoreId && !validStoreId) {
          this.state.identity.adAccountId = '';
          this.touchState();
          this.contextError.set('A store selecionada não pertence ao usuário atual.');
          return;
        }

        if (!validStoreId) {
          this.state.identity.adAccountId = '';
          this.touchState();
          this.syncDraftAvailability();
          return;
        }

        this.syncDraftAvailability();
        this.loadCreationContext(validStoreId);
      },
      { allowSignalWrites: true },
    );
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

  touchState(): void {
    this.revision.update((value) => value + 1);
    this.scheduleAutosave();
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
    this.scrollToSection('builder-ai');
  }

  clearAiPrompt(): void {
    this.state.ui.aiPrompt = '';
    this.state.ui.aiApplied = false;
    this.state.ui.aiDetectedFields = [];
    this.state.ui.aiLastSummary = '';
    this.state.ui.aiCreativeIdeas = [];
    this.touchState();
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

    this.campaignAiService.suggest(prompt, storeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.aiSuggesting.set(false);
          const mergedResult = this.mergeAiResultWithFallback(prompt, this.mapCampaignSuggestionToBuilderResult(result));
          const appliedCount = this.applyAiResult(mergedResult) + this.applyCampaignSuggestionExtras(result);
          this.state.ui.aiCreativeIdeas = result.creativeIdeas || [];
          this.touchState();
          this.ui.showSuccess(
            'IA aplicada ao formulário',
            appliedCount > 0
              ? `${appliedCount} campos foram preenchidos com sugestões da IA.`
              : 'A IA analisou o briefing, mas não encontrou campos vazios para preencher.',
          );
          this.scrollToSection('builder-general');
        },
        error: (error) => {
          this.aiSuggesting.set(false);
          const fallback = this.buildFallbackAiResult(prompt);
          const appliedCount = this.applyAiResult(fallback);
          this.state.ui.aiCreativeIdeas = [];
          this.touchState();
          this.ui.showWarning(
            'IA indisponível no momento',
            appliedCount > 0
              ? 'Aplicamos um fallback local para sugerir campos sem sobrescrever o que você já preencheu.'
              : error?.message || 'Não foi possível gerar sugestões agora.',
          );
          this.scrollToSection('builder-general');
        },
      });
  }

  saveDraft(): void {
    this.persistDraft(false);
  }

  restoreDraft(): void {
    this.restoreDraftFromLocalStorage(true);
  }

  reviewNow(): void {
    this.scrollToSection('builder-review');
  }

  goToNextPendingSection(): void {
    this.scrollToSection(this.nextPendingSection().id);
  }

  scrollToSection(sectionId: string): void {
    this.activeSection.set(sectionId);
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
    this.touchState();

    if (!this.canSubmit()) {
      const message = this.blockerMessage();
      this.submitError.set(message);
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

    this.submitting.set(true);
    this.submitError.set(null);

    this.api.createMetaCampaign(storeId, this.buildApiPayload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
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
          const message = this.formatCampaignCreationError(err);
          this.submitError.set(message);
          this.submitting.set(false);
          this.ui.showError('Não foi possível criar campanha', message);
          this.loadCreationContext(storeId);
        },
      });
  }

  buildExpandedCampaignState(): CampaignBuilderState {
    return cloneCampaignBuilderState(this.state);
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
    return this.state.creative.cta.trim() || 'Saiba mais';
  }

  previewTags(): string[] {
    return this.parsedList(this.state.tracking.goals);
  }

  previewInterests(): string[] {
    return this.parsedList(this.state.audience.interests);
  }

  onPreviewImageError(): void {
    this.previewImageFailed.set(true);
  }

  previewPlaceholderMessage(): string {
    return this.state.creative.imageUrl.trim()
      ? 'Não conseguimos carregar esta imagem'
      : 'Adicione uma URL de imagem para ver o preview';
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

  trackByValue(_: number, item: { value?: string; id?: string; label?: string }): string {
    return item.value || item.id || item.label || '';
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

  private mapCampaignSuggestionToBuilderResult(result: CampaignSuggestionResponse): CampaignAiSuggestResponse {
    const combinedText = [
      this.state.ui.aiPrompt,
      result.audience,
      result.strategy,
      result.budgetSuggestion,
    ].filter(Boolean).join('\n');
    const normalized = normalizePromptText(combinedText);
    const objective = detectObjectiveFromPrompt(normalized);
    const budget = extractBudgetFromPrompt(result.budgetSuggestion || combinedText, normalized);
    const budgetType = detectBudgetTypeFromPrompt(normalized);
    const country = detectCountryFromPrompt(normalized, this.state.audience.country);
    const city = detectCityFromPrompt(combinedText, normalized);
    const region = detectRegionFromPrompt(combinedText, normalized);
    const gender = detectGenderFromPrompt(normalized);
    const cta = detectCtaFromPrompt(normalized);
    const interests = result.audience?.trim() || detectInterestFallbackFromPrompt(normalized);

    return {
      summary: result.strategy || 'Sugestão de campanha gerada pela IA.',
      detectedFields: [
        'Nome',
        'Público',
        'Estratégia',
        'Copy',
        'Orçamento',
        ...(result.creativeIdeas?.length ? ['Ideias de criativo'] : []),
      ],
      suggestions: {
        campaignName: result.name || null,
        objective,
        budget: budget > 0 ? budget : null,
        budgetType,
        country,
        region,
        city,
        ageMin: null,
        ageMax: null,
        gender,
        destinationType: null,
        websiteUrl: null,
        message: result.copy || null,
        headline: result.name || null,
        description: null,
        cta,
        interests,
        utmSource: 'meta',
        utmMedium: 'paid-social',
        utmCampaign: result.name ? this.slugify(result.name) : null,
      },
    };
  }

  private applyCampaignSuggestionExtras(result: CampaignSuggestionResponse): number {
    let appliedCount = 0;

    if (this.shouldApplySuggestion('tracking.goals', this.state.tracking.goals, this.initialState.tracking.goals) && result.strategy?.trim()) {
      this.state.tracking.goals = result.strategy.trim();
      appliedCount += 1;
    }

    const ideas = (result.creativeIdeas || []).map((item) => item.trim()).filter(Boolean);
    if (this.shouldApplySuggestion('tracking.notes', this.state.tracking.notes, this.initialState.tracking.notes) && ideas.length) {
      this.state.tracking.notes = `Ideias de criativo: ${ideas.join('; ')}`;
      appliedCount += 1;
    }

    return appliedCount;
  }

  private applyAiResult(result: CampaignAiSuggestResponse): number {
    const suggestions = result?.suggestions;
    if (!suggestions) {
      this.state.ui.aiDetectedFields = [];
      this.state.ui.aiLastSummary = '';
      this.state.ui.aiApplied = false;
      return 0;
    }

    let appliedCount = 0;

    if (this.shouldApplySuggestion('campaign.name', this.state.campaign.name, '') && suggestions.campaignName) {
      this.state.campaign.name = suggestions.campaignName;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('creative.headline', this.state.creative.headline, '') && suggestions.headline) {
      this.state.creative.headline = suggestions.headline;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('creative.description', this.state.creative.description, '') && suggestions.description) {
      this.state.creative.description = suggestions.description;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('creative.message', this.state.creative.message, '') && suggestions.message) {
      this.state.creative.message = suggestions.message;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('creative.cta', this.state.creative.cta, 'Saiba mais') && suggestions.cta) {
      this.state.creative.cta = this.normalizeAiCta(
        suggestions.cta,
        this.isDestinationType(suggestions.destinationType) ? suggestions.destinationType : this.state.destination.type,
      );
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('campaign.objective', this.state.campaign.objective, this.initialState.campaign.objective) && this.isObjective(suggestions.objective)) {
      this.state.campaign.objective = suggestions.objective;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('budget.value', this.state.budget.value, this.initialState.budget.value) && (suggestions.budget || 0) > 0) {
      this.state.budget.value = Number(suggestions.budget);
      this.state.budget.quickBudget = Number(suggestions.budget);
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('audience.country', this.state.audience.country, this.initialState.audience.country) && this.isValidCountry(suggestions.country || '')) {
      this.state.audience.country = suggestions.country as string;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('audience.region', this.state.audience.region, this.initialState.audience.region) && suggestions.region) {
      this.state.audience.region = suggestions.region;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('audience.city', this.state.audience.city, this.initialState.audience.city) && suggestions.city) {
      this.state.audience.city = suggestions.city;
      appliedCount += 1;
    }

    if (!this.state.identity.adAccountId && this.internalAdAccounts().length === 1) {
      this.state.identity.adAccountId = this.internalAdAccounts()[0].id;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('audience.ageMin', this.state.audience.ageMin, this.initialState.audience.ageMin) && typeof suggestions.ageMin === 'number') {
      this.state.audience.ageMin = suggestions.ageMin;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('audience.ageMax', this.state.audience.ageMax, this.initialState.audience.ageMax) && typeof suggestions.ageMax === 'number') {
      this.state.audience.ageMax = suggestions.ageMax;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('audience.gender', this.state.audience.gender, 'ALL') && this.isGender(suggestions.gender) && suggestions.gender !== 'ALL') {
      this.state.audience.gender = suggestions.gender;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('destination.websiteUrl', this.state.destination.websiteUrl, '') && suggestions.websiteUrl && this.isValidHttpUrl(suggestions.websiteUrl)) {
      this.state.destination.websiteUrl = suggestions.websiteUrl;
      appliedCount += 1;
    }

    if (!this.state.audience.interests.trim() && suggestions.interests) {
      this.state.audience.interests = suggestions.interests;
      appliedCount += 1;
    }

    if (!this.state.tracking.utmSource.trim() && suggestions.utmSource) {
      this.state.tracking.utmSource = suggestions.utmSource;
      appliedCount += 1;
    }

    if (!this.state.tracking.utmMedium.trim() && suggestions.utmMedium) {
      this.state.tracking.utmMedium = suggestions.utmMedium;
      appliedCount += 1;
    }

    if (!this.state.tracking.utmCampaign.trim() && suggestions.utmCampaign) {
      this.state.tracking.utmCampaign = suggestions.utmCampaign;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('budget.budgetType', this.state.budget.budgetType, this.initialState.budget.budgetType) && suggestions.budgetType) {
      this.state.budget.budgetType = suggestions.budgetType;
      appliedCount += 1;
    }

    if (this.shouldApplySuggestion('tracking.mainEvent', this.state.tracking.mainEvent, this.initialState.tracking.mainEvent)) {
      const objective = this.isObjective(suggestions.objective) ? suggestions.objective : this.state.campaign.objective;
      const nextEvent = defaultEventForObjective(objective);
      if (nextEvent && this.state.tracking.mainEvent !== nextEvent) {
        this.state.tracking.mainEvent = nextEvent;
        appliedCount += 1;
      }
    }

    if (this.shouldApplySuggestion('tracking.utmMedium', this.state.tracking.utmMedium, this.initialState.tracking.utmMedium)) {
      const nextMedium = this.state.destination.type === 'messages' ? 'click-to-message' : 'cpc';
      if (nextMedium && this.state.tracking.utmMedium !== nextMedium) {
        this.state.tracking.utmMedium = nextMedium;
        appliedCount += 1;
      }
    }

    this.state.ui.aiLastSummary = result.summary || 'Sugestões geradas pela IA.';
    this.state.ui.aiDetectedFields = Array.isArray(result.detectedFields) ? result.detectedFields : [];
    this.state.ui.aiApplied = appliedCount > 0 || this.state.ui.aiDetectedFields.length > 0;

    return appliedCount;
  }

  private buildFallbackAiResult(prompt: string): CampaignAiSuggestResponse {
    const previousState = this.buildExpandedCampaignState();
    const clonedState = this.buildExpandedCampaignState();
    this.state = clonedState;
    const extraction = this.extractPromptIntoState(prompt);
    const nextState = this.buildExpandedCampaignState();
    this.state = previousState;

    return {
      summary: extraction.summary,
      detectedFields: extraction.detectedFields,
      suggestions: {
        campaignName: nextState.campaign.name !== previousState.campaign.name ? nextState.campaign.name : null,
        objective: nextState.campaign.objective !== previousState.campaign.objective ? nextState.campaign.objective : null,
        budget: nextState.budget.value !== previousState.budget.value ? nextState.budget.value : null,
        budgetType: nextState.budget.budgetType !== previousState.budget.budgetType ? nextState.budget.budgetType : null,
        country: nextState.audience.country !== previousState.audience.country ? nextState.audience.country : null,
        region: nextState.audience.region !== previousState.audience.region ? nextState.audience.region : null,
        city: nextState.audience.city !== previousState.audience.city ? nextState.audience.city : null,
        ageMin: nextState.audience.ageMin !== previousState.audience.ageMin ? nextState.audience.ageMin : null,
        ageMax: nextState.audience.ageMax !== previousState.audience.ageMax ? nextState.audience.ageMax : null,
        gender: nextState.audience.gender !== previousState.audience.gender ? nextState.audience.gender : null,
        destinationType: nextState.destination.type !== previousState.destination.type ? nextState.destination.type : null,
        websiteUrl: nextState.destination.websiteUrl !== previousState.destination.websiteUrl ? nextState.destination.websiteUrl : null,
        message: nextState.creative.message !== previousState.creative.message ? nextState.creative.message : null,
        headline: nextState.creative.headline !== previousState.creative.headline ? nextState.creative.headline : null,
        description: nextState.creative.description !== previousState.creative.description ? nextState.creative.description : null,
        cta: nextState.creative.cta !== previousState.creative.cta ? nextState.creative.cta : null,
        interests: nextState.audience.interests !== previousState.audience.interests ? nextState.audience.interests : null,
        utmSource: nextState.tracking.utmSource !== previousState.tracking.utmSource ? nextState.tracking.utmSource : null,
        utmMedium: nextState.tracking.utmMedium !== previousState.tracking.utmMedium ? nextState.tracking.utmMedium : null,
        utmCampaign: nextState.tracking.utmCampaign !== previousState.tracking.utmCampaign ? nextState.tracking.utmCampaign : null,
      },
    };
  }

  private mergeAiResultWithFallback(prompt: string, result: CampaignAiSuggestResponse): CampaignAiSuggestResponse {
    const fallback = this.buildFallbackAiResult(prompt);
    const aiSuggestions = result?.suggestions ?? {} as CampaignAiSuggestResponse['suggestions'];
    const fallbackSuggestions = fallback.suggestions;

    return {
      summary: result?.summary?.trim() || fallback.summary,
      detectedFields: Array.from(new Set([...(result?.detectedFields || []), ...fallback.detectedFields])),
      suggestions: {
        campaignName: aiSuggestions.campaignName ?? fallbackSuggestions.campaignName,
        objective: aiSuggestions.objective ?? fallbackSuggestions.objective,
        budget: aiSuggestions.budget ?? fallbackSuggestions.budget,
        budgetType: aiSuggestions.budgetType ?? fallbackSuggestions.budgetType,
        country: aiSuggestions.country ?? fallbackSuggestions.country,
        region: aiSuggestions.region ?? fallbackSuggestions.region,
        city: aiSuggestions.city ?? fallbackSuggestions.city,
        ageMin: aiSuggestions.ageMin ?? fallbackSuggestions.ageMin,
        ageMax: aiSuggestions.ageMax ?? fallbackSuggestions.ageMax,
        gender: aiSuggestions.gender ?? fallbackSuggestions.gender,
        destinationType: aiSuggestions.destinationType ?? fallbackSuggestions.destinationType,
        websiteUrl: aiSuggestions.websiteUrl ?? fallbackSuggestions.websiteUrl,
        message: aiSuggestions.message ?? fallbackSuggestions.message,
        headline: aiSuggestions.headline ?? fallbackSuggestions.headline,
        description: aiSuggestions.description ?? fallbackSuggestions.description,
        cta: aiSuggestions.cta ?? fallbackSuggestions.cta,
        interests: aiSuggestions.interests ?? fallbackSuggestions.interests,
        utmSource: aiSuggestions.utmSource ?? fallbackSuggestions.utmSource,
        utmMedium: aiSuggestions.utmMedium ?? fallbackSuggestions.utmMedium,
        utmCampaign: aiSuggestions.utmCampaign ?? fallbackSuggestions.utmCampaign,
      },
    };
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

  private extractPromptIntoState(prompt: string): PromptExtractionResult {
    const detectedFields: string[] = [];
    const normalized = normalizePromptText(prompt);
    const urls = Array.from(prompt.matchAll(/https?:\/\/[^\s]+/gi)).map((item) => item[0]);
    const socialHandle = prompt.match(/@\w[\w.]+/);
    const ageRange = normalized.match(/(\d{2})\s*(?:a|-|ate|até)\s*(\d{2})\s*anos?/i);
    const cityMatch = prompt.match(/(?:em|para|na cidade de|cidade)\s+([A-ZÀ-ÿ][\wÀ-ÿ' -]{2,40})/i);
    const regionMatch = prompt.match(/(?:estado|regiao|região)\s+(?:de\s+)?([A-ZÀ-ÿ][\wÀ-ÿ' -]{2,40})/i);
    const zipMatch = prompt.match(/\b\d{5}-?\d{3}\b/);
    const radiusMatch = normalized.match(/(\d{1,3})\s*km\b/);
    const manualBidMatch = normalized.match(/lance(?: manual)?\s*(?:de|em)?\s*r?\$?\s*(\d+(?:[.,]\d+)?)/i);
    const costControlMatch = normalized.match(/controle de custo\s*(?:de|em)?\s*r?\$?\s*(\d+(?:[.,]\d+)?)/i);
    const roasMatch = normalized.match(/roas(?: minimo| mínimo)?\s*(?:de|em)?\s*(\d+(?:[.,]\d+)?)/i);
    const cplGoalMatch = normalized.match(/(?:cpl|custo por lead|meta de custo)\s*(?:de|em|ate|até)?\s*r?\$?\s*(\d+(?:[.,]\d+)?)/i);
    const pixelMatch = prompt.match(/pixel\s*:?\s*([A-Z0-9 _.-]{3,60})/i);
    const eventMatch = prompt.match(/evento\s*(?:principal)?\s*:?\s*([A-ZÀ-ÿ][\wÀ-ÿ _-]{2,40})/i);
    const objective = detectObjectiveFromPrompt(normalized);
    const budget = extractBudgetFromPrompt(prompt, normalized);
    const budgetType = detectBudgetTypeFromPrompt(normalized);
    const initialStatus = detectInitialStatusFromPrompt(normalized);
    const cta = detectCtaFromPrompt(normalized);
    const country = detectCountryFromPrompt(normalized, this.state.audience.country);
    const gender = detectGenderFromPrompt(normalized);
    const category = detectSpecialCategoryFromPrompt(normalized);
    const placements = detectPlacementsFromPrompt(normalized, this.state.placements.selected);
    const weekDays = detectWeekDaysFromPrompt(normalized);
    const optimizationGoal = detectOptimizationGoalFromPrompt(normalized);
    const billingEvent = detectBillingEventFromPrompt(normalized);
    const conversionWindow = detectConversionWindowFromPrompt(normalized);
    const language = detectPrimaryLanguageFromPrompt(normalized);
    const detectedCity = detectCityFromPrompt(prompt, normalized);
    const detectedRegion = detectRegionFromPrompt(prompt, normalized);
    const interests = this.extractListField(prompt, normalized, ['interesses', 'segmentos', 'afinidades']) || detectInterestFallbackFromPrompt(normalized);
    const behaviors = this.extractListField(prompt, normalized, ['comportamentos']);
    const demographics = this.extractListField(prompt, normalized, ['demograficos', 'demográficos']);
    const excludedInterests = this.extractListField(prompt, normalized, ['excluir interesses', 'interesses excluidos', 'interesses excluídos']);
    const additionalLanguages = this.extractListField(prompt, normalized, ['idiomas adicionais', 'idiomas secundários', 'idiomas secundarios']);
    const notes = this.extractSentenceAfterKeyword(prompt, ['observacoes', 'observações', 'notas internas']);
    const goals = this.extractSentenceAfterKeyword(prompt, ['meta', 'metas']);
    const headline = this.extractSentenceAfterKeyword(prompt, ['headline', 'titulo', 'título']);
    const description = this.extractSentenceAfterKeyword(prompt, ['descricao', 'descrição', 'descricao curta']);
    const mainMessage = this.extractSentenceAfterKeyword(prompt, ['mensagem', 'copy', 'texto principal']);
    const displayName = this.extractSentenceAfterKeyword(prompt, ['nome exibido', 'assinatura']);

    this.state.campaign.objective = objective;
    detectedFields.push('Objetivo');

    if (budget > 0) {
      this.state.budget.value = budget;
      this.state.budget.quickBudget = budget;
      detectedFields.push('Orçamento');
    }

    this.state.budget.budgetType = budgetType;
    detectedFields.push('Tipo de orçamento');

    this.state.campaign.initialStatus = initialStatus;
    detectedFields.push('Status inicial');

    if (category) {
      this.state.campaign.specialCategory = category;
      detectedFields.push('Categoria especial');
    }

    this.state.destination.type = 'site';
    detectedFields.push('Destino');

    if (cta) {
      this.state.creative.cta = cta;
      detectedFields.push('CTA');
    }

    if (country) {
      this.state.audience.country = country;
      detectedFields.push('País');
    }

    if (gender) {
      this.state.audience.gender = gender;
      detectedFields.push('Gênero');
    }

    if (language) {
      this.state.audience.languagePrimary = language;
      detectedFields.push('Idioma principal');
    }

    const rawCity = cityMatch?.[1] ? normalizeDetectedCity(cityMatch[1]) : null;
    const nextCity = rawCity || detectedCity;
    if (nextCity) {
      this.state.audience.city = nextCity;
      detectedFields.push('Cidade');
    }

    const nextRegion = regionMatch?.[1] ? toPromptTitleCase(regionMatch[1]) : detectedRegion;
    if (nextRegion) {
      this.state.audience.region = nextRegion;
      detectedFields.push('Região');
    }

    if (zipMatch?.[0]) {
      this.state.audience.zipCode = zipMatch[0];
      detectedFields.push('CEP');
    }

    if (radiusMatch?.[1]) {
      this.state.audience.radiusKm = Number(radiusMatch[1]);
      detectedFields.push('Raio');
    }

    if (ageRange) {
      this.state.audience.ageMin = Number(ageRange[1]);
      this.state.audience.ageMax = Number(ageRange[2]);
      detectedFields.push('Faixa etária');
    }

    if (interests) {
      this.state.audience.interests = interests;
      detectedFields.push('Interesses');
    }

    if (behaviors) {
      this.state.audience.behaviors = behaviors;
      detectedFields.push('Comportamentos');
    }

    if (demographics) {
      this.state.audience.demographics = demographics;
      detectedFields.push('Dados demográficos');
    }

    if (excludedInterests) {
      this.state.audience.excludedInterests = excludedInterests;
      detectedFields.push('Excluir interesses');
    }

    if (additionalLanguages) {
      this.state.audience.languagesAdditional = additionalLanguages;
      detectedFields.push('Idiomas adicionais');
    }

    if (placements.length) {
      this.state.placements.selected = placements;
      this.syncPlacementPlatforms(placements);
      detectedFields.push('Posicionamentos');
    }

    if (weekDays.length) {
      this.state.schedule.weekDays = weekDays;
      detectedFields.push('Dias da semana');
    }

    if (optimizationGoal) {
      this.state.budget.optimizationGoal = optimizationGoal;
      detectedFields.push('Optimization goal');
    }

    if (billingEvent) {
      this.state.budget.billingEvent = billingEvent;
      detectedFields.push('Billing event');
    }

    if (conversionWindow) {
      this.state.budget.conversionWindow = conversionWindow;
      detectedFields.push('Janela de conversão');
    }

    if (manualBidMatch?.[1]) {
      this.state.budget.manualBid = parsePromptDecimal(manualBidMatch[1]);
      detectedFields.push('Lance manual');
    }

    if (costControlMatch?.[1]) {
      this.state.budget.costControl = parsePromptDecimal(costControlMatch[1]);
      detectedFields.push('Controle de custo');
    }

    if (roasMatch?.[1]) {
      this.state.budget.minRoas = parsePromptDecimal(roasMatch[1]);
      detectedFields.push('ROAS mínimo');
    }

    if (cplGoalMatch?.[1]) {
      this.state.budget.costPerResultGoal = parsePromptDecimal(cplGoalMatch[1]);
      detectedFields.push('Meta de custo');
    }

    if (socialHandle?.[0]) {
      this.state.identity.instagramAccount = socialHandle[0];
      detectedFields.push('Conta do Instagram');
    }

    if (displayName) {
      this.state.identity.displayName = displayName;
      detectedFields.push('Nome exibido');
    }

    const chosenAccount = this.pickAdAccountFromPrompt(prompt);
    if (chosenAccount) {
      this.state.identity.adAccountId = chosenAccount.id;
      detectedFields.push('Conta de anúncio');
    }

    if (urls.length) {
      const imageUrl = urls.find((url) => this.looksLikeImageUrl(url));
      const destinationUrl = urls.find((url) => url !== imageUrl);
      if (imageUrl) {
        this.state.creative.imageUrl = imageUrl;
        detectedFields.push('URL da imagem');
      }
      if (destinationUrl) {
        this.state.destination.websiteUrl = destinationUrl;
        detectedFields.push('URL de destino');
      }
    }

    if (mainMessage) {
      this.state.creative.message = mainMessage;
      detectedFields.push('Mensagem principal');
    } else if (!this.state.creative.message.trim()) {
      this.state.creative.message = this.buildAiMessage();
      detectedFields.push('Mensagem principal sugerida');
    }

    if (headline) {
      this.state.creative.headline = headline;
      detectedFields.push('Headline');
    } else if (!this.state.creative.headline.trim()) {
      this.state.creative.headline = this.buildAiHeadline();
      detectedFields.push('Headline sugerida');
    }

    if (description) {
      this.state.creative.description = description;
      detectedFields.push('Descrição');
    } else if (!this.state.creative.description.trim()) {
      this.state.creative.description = this.buildAiDescription();
      detectedFields.push('Descrição sugerida');
    }

    if (pixelMatch?.[1]) {
      this.state.tracking.pixel = pixelMatch[1].trim();
      detectedFields.push('Pixel');
    }

    if (eventMatch?.[1]) {
      this.state.tracking.mainEvent = eventMatch[1].trim();
      detectedFields.push('Evento principal');
    } else if (!this.state.tracking.mainEvent.trim()) {
      this.state.tracking.mainEvent = defaultEventForObjective(objective);
      detectedFields.push('Evento principal sugerido');
    }

    if (goals) {
      this.state.tracking.goals = goals;
      detectedFields.push('Metas');
    }

    if (!this.state.tracking.utmCampaign.trim()) {
      const parts = [
        this.slugify(this.state.campaign.name || this.selectedObjectiveLabel()),
        this.slugify(this.state.destination.type),
      ].filter(Boolean);
      this.state.tracking.utmCampaign = parts.join('-');
      detectedFields.push('UTM campaign sugerida');
    }

    if (notes) {
      this.state.tracking.notes = notes;
      detectedFields.push('Observações');
    }

    const summary = [
      this.selectedObjectiveLabel(),
      budget > 0 ? `${this.formatCurrency(budget)}/${budgetType === 'daily' ? 'dia' : 'campanha'}` : null,
      this.state.audience.city.trim() || this.state.audience.country.trim().toUpperCase(),
      this.state.creative.cta.trim() || null,
      this.destinationSummary(),
    ].filter(Boolean).join(' · ');

    return {
      detectedFields: Array.from(new Set(detectedFields)),
      summary: summary || 'Briefing interpretado e distribuído nas seções principais.',
    };
  }

  private buildInitialState(): CampaignBuilderState {
    return buildInitialCampaignBuilderState();
  }

  private buildAiCampaignName(): string {
    const objective = this.selectedObjectiveLabel();
    const place = this.state.audience.city.trim() || this.state.audience.region.trim();
    const focus = place ? `${objective} ${place}` : objective;
    return `IA | ${this.selectedStoreName()} | ${focus}`;
  }

  private buildAiHeadline(): string {
    return buildAiHeadlineForState(this.state.destination.type, this.state.campaign.objective);
  }

  private buildAiDescription(): string {
    return buildAiDescriptionForObjective(this.selectedObjectiveLabel());
  }

  private buildAiMessage(): string {
    return buildAiMessageForState({
      city: this.state.audience.city,
      region: this.state.audience.region,
      country: this.state.audience.country,
      destinationType: this.state.destination.type,
      selectedObjectiveLabel: this.selectedObjectiveLabel(),
    });
  }

  private buildAiInterestFallback(): string {
    return detectInterestFallbackFromPrompt(normalizePromptText(this.state.ui.aiPrompt));
  }

  private extractSentenceAfterKeyword(prompt: string, keywords: string[]): string {
    for (const keyword of keywords) {
      const pattern = new RegExp(`${keyword}\\s*[:|-]\\s*([^\\n.]{4,180})`, 'i');
      const match = prompt.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  }

  private extractListField(prompt: string, normalized: string, keywords: string[]): string {
    for (const keyword of keywords) {
      const safeKeyword = normalizePromptText(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`${safeKeyword}\\s*[:|-]\\s*([^\\n.]{3,220})`, 'i');
      const match = normalizePromptText(prompt).match(pattern);
      if (match?.[1]) {
        return match[1]
          .split(/,|;| e /)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 8)
          .join(', ');
      }
    }
    return '';
  }

  private pickAdAccountFromPrompt(prompt: string): AdAccount | null {
    const normalized = normalizePromptText(prompt);
    return this.internalAdAccounts().find((account) =>
      normalized.includes(normalizePromptText(account.name)) ||
      normalized.includes(normalizePromptText(account.externalId || account.metaId || account.id)),
    ) || (this.internalAdAccounts().length === 1 ? this.internalAdAccounts()[0] : null);
  }

  private looksLikeImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
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

  private normalizeAiCta(value: string, destinationType?: CampaignDestinationType): string {
    const normalized = normalizePromptText(value);
    const prefersMessages = destinationType === 'messages';

    if (/(whatsapp|falar|conversar|contato|contact)/i.test(normalized)) return 'Fale conosco';
    if (/(mensagem|message|messenger|direct|dm)/i.test(normalized)) return 'Enviar mensagem';
    if (/(comprar|buy|shop|oferta|promo)/i.test(normalized)) return 'Comprar agora';
    if (/(cadastro|lead|inscricao|inscrição|proposta)/i.test(normalized)) return 'Quero oferta';
    if (/(saiba|learn|more|detalhe|conheca|conheça)/i.test(normalized)) {
      return prefersMessages ? 'Fale conosco' : 'Saiba mais';
    }

    if (prefersMessages && value === 'Saiba mais') {
      return 'Fale conosco';
    }

    return this.ctaOptions.includes(value) ? value : prefersMessages ? 'Fale conosco' : 'Saiba mais';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
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
      this.state = {
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
    const parts = [
      err?.message || err?.details?.message || 'Não foi possível criar campanha. Verifique os dados e tente novamente.',
    ];
    const step = err?.step || err?.details?.step;
    const executionId = err?.executionId || err?.details?.executionId;
    const error = err?.error || err?.details?.error;
    if (step) parts.push(`Etapa: ${step}.`);
    if (executionId) parts.push(`Execução: ${executionId}.`);
    if (error && error !== parts[0]) parts.push(`Detalhe: ${error}.`);
    return parts.join(' ');
  }
}

export type { CampaignCreateSuccessEvent } from './campaign-builder.types';
