import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Output, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import {
  AdAccount,
  CreateMetaCampaignRequest,
  CreateMetaCampaignResponse,
  IntegrationProvider,
  IntegrationStatus,
  StoreIntegration,
} from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';

type CampaignObjective = 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'REACH';
type CampaignGender = 'ALL' | 'MALE' | 'FEMALE';
type CampaignPlacement = 'feed' | 'stories' | 'reels' | 'explore' | 'messenger' | 'audience_network';
type CampaignInitialStatus = 'PAUSED' | 'ACTIVE';
type CampaignDestinationType = 'site' | 'messages' | 'form' | 'app' | 'catalog';
type CampaignBudgetType = 'daily' | 'lifetime';

interface CampaignBuilderState {
  campaign: {
    name: string;
    objective: CampaignObjective;
    initialStatus: CampaignInitialStatus;
    specialCategory: string;
    buyingType: string;
    abTest: boolean;
    campaignBudgetOptimization: boolean;
    campaignSpendLimit: number | null;
  };
  identity: {
    adAccountId: string;
    facebookPageId: string;
    instagramAccount: string;
    displayName: string;
    timezone: string;
    currency: string;
  };
  audience: {
    autoAudience: boolean;
    country: string;
    region: string;
    city: string;
    zipCode: string;
    radiusKm: number;
    presenceType: string;
    ageMin: number;
    ageMax: number;
    gender: CampaignGender;
    languagePrimary: string;
    languagesAdditional: string;
    interests: string;
    behaviors: string;
    demographics: string;
    excludedInterests: string;
    savedAudience: string;
    customAudience: string;
    lookalikeAudience: string;
    excludedAudiences: string;
  };
  budget: {
    budgetType: CampaignBudgetType;
    value: number;
    quickBudget: number | null;
    adSetSpendLimit: number | null;
    bidStrategy: string;
    costControl: number | null;
    minRoas: number | null;
    costPerResultGoal: number | null;
    manualBid: number | null;
    billingEvent: string;
    optimizationGoal: string;
    conversionWindow: string;
  };
  schedule: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    weekDays: string[];
    timeBlocks: string;
    advancedScheduling: boolean;
  };
  placements: {
    selected: CampaignPlacement[];
    platforms: {
      facebook: boolean;
      instagram: boolean;
      messenger: boolean;
      audienceNetwork: boolean;
    };
  };
  destination: {
    type: CampaignDestinationType;
    websiteUrl: string;
    messagesDestination: string;
    formName: string;
    appLink: string;
    catalogId: string;
  };
  creative: {
    message: string;
    headline: string;
    description: string;
    cta: string;
    imageUrl: string;
    carousel: boolean;
  };
  tracking: {
    pixel: string;
    mainEvent: string;
    conversionTracking: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    goals: string;
    notes: string;
  };
  ui: {
    aiPrompt: string;
    aiApplied: boolean;
    aiDetectedFields: string[];
    aiLastSummary: string;
  };
}

interface CreationReadinessItem {
  id: string;
  label: string;
  done: boolean;
}

interface SectionProgress {
  id: string;
  label: string;
  done: boolean;
}

interface SummaryRow {
  label: string;
  value: string;
}

interface ReviewSignal {
  id: string;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
}

interface SuccessOverlayState {
  name: string;
  response: CreateMetaCampaignResponse;
}

interface PromptExtractionResult {
  detectedFields: string[];
  summary: string;
}

export interface CampaignCreateSuccessEvent {
  name: string;
  storeName: string;
  response: CreateMetaCampaignResponse;
}

@Component({
  selector: 'app-campaign-create-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, UiBadgeComponent],
  templateUrl: './campaign-create-panel.component.html',
  styleUrls: ['./campaign-create-panel.component.scss'],
})
export class CampaignCreatePanelComponent {
  private api = inject(ApiService);
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
    { value: 'messages', label: 'Mensagens' },
    { value: 'form', label: 'Formulário' },
    { value: 'app', label: 'App' },
    { value: 'catalog', label: 'Catálogo' },
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

  state: CampaignBuilderState = this.buildInitialState();

  private contextRequestId = 0;
  private autosaveTimer: ReturnType<typeof window.setTimeout> | null = null;
  private saveIndicatorTimer: ReturnType<typeof window.setTimeout> | null = null;
  private pendingCreatedEvent: CampaignCreateSuccessEvent | null = null;

  readonly sectionProgress = computed<SectionProgress[]>(() => {
    this.revision();
    return [
      { id: 'builder-ai', label: 'IA por prompt', done: this.aiSectionComplete() },
      { id: 'builder-general', label: 'Dados gerais', done: this.generalSectionComplete() },
      { id: 'builder-identity', label: 'Conta e identidade', done: this.identitySectionComplete() },
      { id: 'builder-audience', label: 'Público', done: this.audienceSectionComplete() },
      { id: 'builder-budget', label: 'Orçamento e lance', done: this.budgetSectionComplete() },
      { id: 'builder-schedule', label: 'Agenda', done: this.scheduleSectionComplete() },
      { id: 'builder-placements', label: 'Posicionamentos', done: this.placementSectionComplete() },
      { id: 'builder-destination', label: 'Destino', done: this.destinationSectionComplete() },
      { id: 'builder-creative', label: 'Criativo', done: this.creativeSectionComplete() },
      { id: 'builder-tracking', label: 'Rastreamento', done: this.trackingSectionComplete() },
      { id: 'builder-review', label: 'Revisão', done: this.canSubmit() },
    ];
  });

  readonly progressPercent = computed(() => {
    const sections = this.sectionProgress();
    const completed = sections.filter((item) => item.done).length;
    return Math.round((completed / sections.length) * 100);
  });

  readonly readinessItems = computed<CreationReadinessItem[]>(() => {
    this.revision();
    const hasStoreSelected = !!this.storeContext.selectedStoreId();
    const hasValidStore = !!this.storeContext.getValidSelectedStoreId();
    return [
      { id: 'store-selected', label: 'Existe uma store selecionada', done: hasStoreSelected },
      { id: 'store-valid', label: 'A store selecionada é válida para o usuário atual', done: hasValidStore },
      { id: 'integration', label: 'A integração Meta da store está conectada', done: this.isIntegrationConnected() },
      { id: 'page', label: 'A store possui página Meta configurada', done: this.hasConfiguredPage() },
      { id: 'accounts', label: 'Existem contas de anúncio sincronizadas', done: this.hasSyncedAdAccounts() },
      { id: 'fields', label: 'Os campos reais obrigatórios estão preenchidos', done: this.realPayloadComplete() },
    ];
  });

  readonly summaryRows = computed<SummaryRow[]>(() => {
    this.revision();
    return [
      { label: 'Store', value: this.selectedStoreName() },
      { label: 'Campanha', value: this.state.campaign.name.trim() || 'Sem nome ainda' },
      { label: 'Objetivo', value: this.selectedObjectiveLabel() },
      { label: 'Conta', value: this.selectedAdAccountName() },
      { label: 'Página', value: this.selectedPageName() },
      { label: 'Orçamento', value: `${this.formatCurrency(this.state.budget.value)}/${this.state.budget.budgetType === 'daily' ? 'dia' : 'campanha'}` },
      { label: 'Público', value: this.audienceSummary() },
      { label: 'CTA / destino', value: `${this.state.creative.cta} · ${this.destinationSummary()}` },
      { label: 'Rastreamento', value: this.trackingSummary() },
    ];
  });

  readonly simulatedMetrics = computed(() => {
    this.revision();
    const baseBudget = Math.max(this.state.budget.value || 0, 1);
    const objectiveFactor = this.state.campaign.objective === 'OUTCOME_LEADS' ? 1.2 : this.state.campaign.objective === 'REACH' ? 2.1 : 1.6;
    const placementsFactor = Math.max(this.state.placements.selected.length, 1) / 3;
    const qualityFactor = this.state.creative.headline.trim() && this.state.creative.description.trim() ? 1.15 : 0.94;
    const reach = Math.round(baseBudget * 92 * objectiveFactor * placementsFactor);
    const clicks = Math.round(baseBudget * 4.8 * qualityFactor);
    const leads = Math.round(clicks * (this.state.campaign.objective === 'OUTCOME_LEADS' ? 0.18 : 0.07));
    return {
      reach,
      clicks,
      leads,
      cpl: leads > 0 ? +(baseBudget / leads).toFixed(2) : 0,
      ctr: reach > 0 ? +((clicks / reach) * 100).toFixed(2) : 0,
    };
  });

  readonly reviewSignals = computed<ReviewSignal[]>(() => {
    this.revision();
    const signals: ReviewSignal[] = [];
    if (!this.realPayloadComplete()) {
      signals.push({ id: 'required', label: 'Campos reais obrigatórios ainda não estão completos.', tone: 'warning' });
    } else {
      signals.push({ id: 'required-ok', label: 'Payload real pronto para o backend atual.', tone: 'success' });
    }

    if (!this.isValidImageUrl(this.state.creative.imageUrl)) {
      signals.push({ id: 'image-url', label: 'URL da imagem inválida ou incompleta.', tone: 'danger' });
    }

    if (!this.isValidCountry(this.state.audience.country)) {
      signals.push({ id: 'country', label: 'País deve usar código ISO de 2 letras.', tone: 'warning' });
    }

    if (this.state.budget.value < 20) {
      signals.push({ id: 'budget-low', label: 'Orçamento baixo pode limitar entrega e aprendizado.', tone: 'info' });
    }

    if (!this.state.tracking.pixel.trim()) {
      signals.push({ id: 'pixel', label: 'Pixel ainda não informado para mensuração.', tone: 'warning' });
    }

    if (this.state.destination.type === 'site' && !this.state.destination.websiteUrl.trim()) {
      signals.push({ id: 'destination', label: 'Destino de site exige URL de destino.', tone: 'danger' });
    }

    return signals;
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
    this.state.destination.type = value;
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
    this.touchState();
  }

  applyPromptPreset(prompt: string): void {
    this.state.ui.aiPrompt = prompt;
    this.touchState();
  }

  applyAiSuggestions(): void {
    const prompt = this.state.ui.aiPrompt.trim();
    if (!prompt) {
      this.ui.showWarning('Prompt vazio', 'Descreva rapidamente a campanha para gerar sugestões.');
      return;
    }

    const extraction = this.extractPromptIntoState(prompt);
    if (!this.state.campaign.name.trim()) {
      this.state.campaign.name = this.buildAiCampaignName();
      extraction.detectedFields.push('Nome sugerido da campanha');
    }

    if (!this.state.creative.headline.trim()) {
      this.state.creative.headline = this.buildAiHeadline();
      extraction.detectedFields.push('Headline sugerida');
    }

    if (!this.state.creative.description.trim()) {
      this.state.creative.description = this.buildAiDescription();
      extraction.detectedFields.push('Descrição sugerida');
    }

    if (!this.state.creative.message.trim()) {
      this.state.creative.message = this.buildAiMessage();
      extraction.detectedFields.push('Mensagem principal sugerida');
    }

    if (!this.state.audience.interests.trim()) {
      this.state.audience.interests = this.buildAiInterestFallback();
      extraction.detectedFields.push('Interesses sugeridos');
    }

    if (!this.state.tracking.utmSource.trim()) {
      this.state.tracking.utmSource = 'meta';
      extraction.detectedFields.push('UTM source');
    }

    if (!this.state.tracking.utmMedium.trim()) {
      this.state.tracking.utmMedium = 'paid-social';
      extraction.detectedFields.push('UTM medium');
    }

    if (!this.state.tracking.utmCampaign.trim()) {
      this.state.tracking.utmCampaign = this.slugify(this.state.campaign.name || 'campanha-ia');
      extraction.detectedFields.push('UTM campaign');
    }

    this.state.ui.aiDetectedFields = Array.from(new Set(extraction.detectedFields));
    this.state.ui.aiLastSummary = extraction.summary;
    this.state.ui.aiApplied = true;
    this.touchState();
    this.ui.showSuccess(
      'Sugestões aplicadas',
      `${this.state.ui.aiDetectedFields.length} campos foram preenchidos ou refinados com base no prompt.`,
    );
    this.scrollToSection('builder-general');
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
      this.reviewNow();
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
            response,
          };
          this.successOverlay.set({
            name: this.state.campaign.name.trim(),
            response,
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
    return JSON.parse(JSON.stringify(this.state)) as CampaignBuilderState;
  }

  buildApiPayload(): CreateMetaCampaignRequest {
    return {
      name: this.state.campaign.name.trim(),
      objective: this.state.campaign.objective,
      dailyBudget: Number(this.state.budget.value),
      country: this.state.audience.country.trim().toUpperCase(),
      adAccountId: this.state.identity.adAccountId,
      message: this.state.creative.message.trim(),
      imageUrl: this.state.creative.imageUrl.trim(),
    };
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

    switch (field) {
      case 'campaign.name':
        return !this.state.campaign.name.trim();
      case 'identity.adAccountId':
        return !this.state.identity.adAccountId;
      case 'audience.country':
        return !this.isValidCountry(this.state.audience.country);
      case 'budget.value':
        return !(Number(this.state.budget.value) > 0);
      case 'creative.message':
        return !this.state.creative.message.trim();
      case 'creative.imageUrl':
        return !this.isValidImageUrl(this.state.creative.imageUrl);
      case 'destination.websiteUrl':
        return this.state.destination.type === 'site' && !this.state.destination.websiteUrl.trim();
      default:
        return false;
    }
  }

  blockerMessage(): string {
    if (this.contextError()) return this.contextError() as string;
    if (this.loadingContext()) return 'Carregando contexto da store, integração Meta e contas disponíveis.';
    if (!this.storeContext.selectedStoreId()) return 'Selecione uma store para iniciar a criação da campanha.';
    if (!this.storeContext.getValidSelectedStoreId()) return 'A store escolhida não pertence ao usuário atual. Selecione uma store válida.';
    if (!this.isIntegrationConnected()) return 'Esta store ainda não está pronta para criação de campanhas. Conecte a Meta e configure a página primeiro.';
    if (!this.hasConfiguredPage()) return 'A store está conectada, mas ainda precisa de uma página Meta configurada antes do envio.';
    if (!this.hasSyncedAdAccounts()) return 'Sincronize as contas da store em Integrações para liberar a criação de campanhas.';
    if (!this.realPayloadComplete()) return 'Complete nome, objetivo, orçamento, país, conta, mensagem e imagem antes do envio.';
    return 'Tudo pronto para revisar e enviar.';
  }

  selectedStoreName(): string {
    return this.storeContext.selectedStore()?.name || 'Selecione uma store';
  }

  selectedPageName(): string {
    const integration = this.integration();
    return integration?.pageName || integration?.pageId || 'Página não configurada';
  }

  selectedAdAccountName(): string {
    const account = this.internalAdAccounts().find((item) => item.id === this.state.identity.adAccountId);
    return account ? `${account.name} · ${account.externalId || account.metaId || account.id}` : 'Conta não selecionada';
  }

  selectedObjectiveLabel(): string {
    return this.objectiveOptions.find((option) => option.value === this.state.campaign.objective)?.label || 'Não definido';
  }

  audienceSummary(): string {
    const country = this.state.audience.country.trim().toUpperCase() || '--';
    const ageRange = `${this.state.audience.ageMin}-${this.state.audience.ageMax}`;
    const gender = this.genderOptions.find((option) => option.value === this.state.audience.gender)?.label || 'Todos';
    const city = this.state.audience.city.trim() || 'cidade aberta';
    return `${country} · ${city} · ${ageRange} anos · ${gender}`;
  }

  destinationSummary(): string {
    switch (this.state.destination.type) {
      case 'site':
        return this.state.destination.websiteUrl.trim() || 'site sem URL';
      case 'messages':
        return this.state.destination.messagesDestination.trim() || 'mensagens';
      case 'form':
        return this.state.destination.formName.trim() || 'formulário';
      case 'app':
        return this.state.destination.appLink.trim() || 'app';
      default:
        return this.state.destination.catalogId.trim() || 'catálogo';
    }
  }

  trackingSummary(): string {
    const pieces = [
      this.state.tracking.pixel.trim() || 'sem pixel',
      this.state.tracking.mainEvent.trim() || 'sem evento',
      this.state.tracking.utmCampaign.trim() || 'sem UTM',
    ];
    return pieces.join(' · ');
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

  compatibilityNote(): string {
    return this.state.campaign.initialStatus === 'ACTIVE'
      ? 'Compatibilidade atual: o backend real ainda cria a campanha pausada mesmo quando o status inicial estiver marcado como ativa.'
      : 'Compatibilidade atual: a campanha é enviada com status pausado no fluxo real atual.';
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
    return !this.loadingContext()
      && !this.submitting()
      && this.readinessItems().every((item) => item.done)
      && !this.fieldInvalid('creative.imageUrl')
      && !this.fieldInvalid('destination.websiteUrl');
  }

  sectionTone(sectionId: string): 'success' | 'warning' | 'neutral' {
    const section = this.sectionProgress().find((item) => item.id === sectionId);
    if (!section) return 'neutral';
    return section.done ? 'success' : 'warning';
  }

  sectionModeLabel(sectionId: string): string {
    if (sectionId === 'builder-ai') {
      return 'Acelera preenchimento';
    }
    if (sectionId === 'builder-general' || sectionId === 'builder-identity' || sectionId === 'builder-audience' || sectionId === 'builder-budget' || sectionId === 'builder-creative') {
      return 'Impacta envio atual';
    }
    return 'Estrutura expandida';
  }

  aiSectionComplete(): boolean {
    return this.state.ui.aiApplied || !!this.state.ui.aiPrompt.trim();
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
    const normalized = this.normalizeText(prompt);
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
    const objective = this.detectObjective(normalized);
    const budget = this.extractBudget(prompt, normalized);
    const budgetType = this.detectBudgetType(normalized);
    const initialStatus = this.detectInitialStatus(normalized);
    const destinationType = this.detectDestinationType(normalized);
    const cta = this.detectCta(normalized);
    const country = this.detectCountry(normalized);
    const gender = this.detectGender(normalized);
    const category = this.detectSpecialCategory(normalized);
    const placements = this.detectPlacements(normalized);
    const weekDays = this.detectWeekDays(normalized);
    const optimizationGoal = this.detectOptimizationGoal(normalized);
    const billingEvent = this.detectBillingEvent(normalized);
    const conversionWindow = this.detectConversionWindow(normalized);
    const language = this.detectPrimaryLanguage(normalized);
    const interests = this.extractListField(prompt, normalized, ['interesses', 'segmentos', 'afinidades']) || this.detectInterestFallback(normalized);
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

    this.state.destination.type = destinationType;
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

    if (cityMatch?.[1]) {
      this.state.audience.city = this.toTitleCase(cityMatch[1]);
      detectedFields.push('Cidade');
    }

    if (regionMatch?.[1]) {
      this.state.audience.region = this.toTitleCase(regionMatch[1]);
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
      this.state.budget.manualBid = this.parseDecimal(manualBidMatch[1]);
      detectedFields.push('Lance manual');
    }

    if (costControlMatch?.[1]) {
      this.state.budget.costControl = this.parseDecimal(costControlMatch[1]);
      detectedFields.push('Controle de custo');
    }

    if (roasMatch?.[1]) {
      this.state.budget.minRoas = this.parseDecimal(roasMatch[1]);
      detectedFields.push('ROAS mínimo');
    }

    if (cplGoalMatch?.[1]) {
      this.state.budget.costPerResultGoal = this.parseDecimal(cplGoalMatch[1]);
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
      if (destinationType === 'site' && destinationUrl) {
        this.state.destination.websiteUrl = destinationUrl;
        detectedFields.push('URL de destino');
      }
      if (destinationType === 'app' && destinationUrl) {
        this.state.destination.appLink = destinationUrl;
        detectedFields.push('Link do app');
      }
    }

    if (destinationType === 'messages') {
      this.state.destination.messagesDestination = this.state.destination.messagesDestination || 'WhatsApp';
    }

    if (mainMessage) {
      this.state.creative.message = mainMessage;
      detectedFields.push('Mensagem principal');
    }

    if (headline) {
      this.state.creative.headline = headline;
      detectedFields.push('Headline');
    }

    if (description) {
      this.state.creative.description = description;
      detectedFields.push('Descrição');
    }

    if (pixelMatch?.[1]) {
      this.state.tracking.pixel = pixelMatch[1].trim();
      detectedFields.push('Pixel');
    }

    if (eventMatch?.[1]) {
      this.state.tracking.mainEvent = eventMatch[1].trim();
      detectedFields.push('Evento principal');
    } else if (!this.state.tracking.mainEvent.trim()) {
      this.state.tracking.mainEvent = this.defaultEventForObjective(objective);
      detectedFields.push('Evento principal sugerido');
    }

    if (goals) {
      this.state.tracking.goals = goals;
      detectedFields.push('Metas');
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
    const today = new Date();
    const inSevenDays = new Date();
    inSevenDays.setDate(inSevenDays.getDate() + 7);

    return {
      campaign: {
        name: '',
        objective: 'OUTCOME_TRAFFIC',
        initialStatus: 'PAUSED',
        specialCategory: 'Nenhuma',
        buyingType: 'Auction',
        abTest: false,
        campaignBudgetOptimization: true,
        campaignSpendLimit: null,
      },
      identity: {
        adAccountId: '',
        facebookPageId: '',
        instagramAccount: '',
        displayName: '',
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
      },
      audience: {
        autoAudience: true,
        country: 'BR',
        region: '',
        city: '',
        zipCode: '',
        radiusKm: 10,
        presenceType: 'Pessoas que moram nesta região',
        ageMin: 21,
        ageMax: 55,
        gender: 'ALL',
        languagePrimary: 'Português',
        languagesAdditional: '',
        interests: '',
        behaviors: '',
        demographics: '',
        excludedInterests: '',
        savedAudience: '',
        customAudience: '',
        lookalikeAudience: '',
        excludedAudiences: '',
      },
      budget: {
        budgetType: 'daily',
        value: 50,
        quickBudget: 50,
        adSetSpendLimit: null,
        bidStrategy: 'Highest volume',
        costControl: null,
        minRoas: null,
        costPerResultGoal: null,
        manualBid: null,
        billingEvent: 'Impressions',
        optimizationGoal: 'Link clicks',
        conversionWindow: '7-day click',
      },
      schedule: {
        startDate: today.toISOString().slice(0, 10),
        startTime: '09:00',
        endDate: inSevenDays.toISOString().slice(0, 10),
        endTime: '22:00',
        weekDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        timeBlocks: '09:00-12:00, 14:00-18:00',
        advancedScheduling: false,
      },
      placements: {
        selected: ['feed', 'stories', 'reels'],
        platforms: {
          facebook: true,
          instagram: true,
          messenger: false,
          audienceNetwork: false,
        },
      },
      destination: {
        type: 'site',
        websiteUrl: '',
        messagesDestination: '',
        formName: '',
        appLink: '',
        catalogId: '',
      },
      creative: {
        message: '',
        headline: '',
        description: '',
        cta: 'Saiba mais',
        imageUrl: '',
        carousel: false,
      },
      tracking: {
        pixel: '',
        mainEvent: 'Purchase',
        conversionTracking: 'Conversão padrão',
        utmSource: 'meta',
        utmMedium: 'paid-social',
        utmCampaign: '',
        goals: '',
        notes: '',
      },
      ui: {
        aiPrompt: '',
        aiApplied: false,
        aiDetectedFields: [],
        aiLastSummary: '',
      },
    };
  }

  private detectObjective(normalized: string): CampaignObjective {
    if (/(lead|leads|cadastro|captacao|captação|whatsapp|formulario|formulário)/i.test(normalized)) return 'OUTCOME_LEADS';
    if (/(alcance|awareness|reconhecimento|visibilidade)/i.test(normalized)) return 'REACH';
    return 'OUTCOME_TRAFFIC';
  }

  private extractBudget(prompt: string, normalized: string): number {
    const currencyMatch = normalized.match(/r\$\s*(\d{2,5}(?:[.,]\d{1,2})?)/i);
    if (currencyMatch?.[1]) return Math.round(this.parseDecimal(currencyMatch[1]));

    const phrasedMatch = normalized.match(/(?:orcamento|orçamento|budget|investimento)\s*(?:de|em)?\s*(\d{2,5}(?:[.,]\d{1,2})?)/i);
    if (phrasedMatch?.[1]) return Math.round(this.parseDecimal(phrasedMatch[1]));

    const dailyMatch = normalized.match(/(\d{2,5}(?:[.,]\d{1,2})?)\s*(?:por dia|\/dia|ao dia)/i);
    if (dailyMatch?.[1]) return Math.round(this.parseDecimal(dailyMatch[1]));

    const generic = prompt.match(/\b(\d{2,5})\b/);
    return generic ? Number(generic[1]) : 0;
  }

  private detectBudgetType(normalized: string): CampaignBudgetType {
    if (/(vitalicio|vitalício|total da campanha|campanha inteira|lifetime)/i.test(normalized)) return 'lifetime';
    return 'daily';
  }

  private detectInitialStatus(normalized: string): CampaignInitialStatus {
    if (/(ativar agora|iniciar ativa|publicar ativa|subir ativa)/i.test(normalized)) return 'ACTIVE';
    return 'PAUSED';
  }

  private detectDestinationType(normalized: string): CampaignDestinationType {
    if (/(whatsapp|messenger|direct|mensagens)/i.test(normalized)) return 'messages';
    if (/(formulario|formulário|lead ads|cadastro)/i.test(normalized)) return 'form';
    if (/\bapp\b|play store|app store|deep link/i.test(normalized)) return 'app';
    if (/(catalogo|catálogo|produtos)/i.test(normalized)) return 'catalog';
    return 'site';
  }

  private detectCta(normalized: string): string {
    if (/(whatsapp|falar|conversar|mensagens)/i.test(normalized)) return 'Fale conosco';
    if (/(comprar|oferta|promo|promocao|promoção)/i.test(normalized)) return 'Comprar agora';
    if (/(cadastro|lead|inscricao|inscrição)/i.test(normalized)) return 'Quero oferta';
    return 'Saiba mais';
  }

  private detectCountry(normalized: string): string {
    const countries: Array<{ pattern: RegExp; code: string }> = [
      { pattern: /\bbrasil\b|\bbr\b/, code: 'BR' },
      { pattern: /\bportugal\b|\bpt\b/, code: 'PT' },
      { pattern: /\bargentina\b|\bar\b/, code: 'AR' },
      { pattern: /\bmexico\b|\bm[eé]xico\b|\bmx\b/, code: 'MX' },
      { pattern: /\bchile\b|\bcl\b/, code: 'CL' },
      { pattern: /\bcolombia\b|\bco\b/, code: 'CO' },
      { pattern: /\bperu\b|\bperú\b|\bpe\b/, code: 'PE' },
      { pattern: /\beua\b|\bestados unidos\b|\busa\b|\bus\b/, code: 'US' },
    ];
    return countries.find((item) => item.pattern.test(normalized))?.code || this.state.audience.country;
  }

  private detectGender(normalized: string): CampaignGender | null {
    if (/(feminino|mulher|mulheres)/i.test(normalized)) return 'FEMALE';
    if (/(masculino|homem|homens)/i.test(normalized)) return 'MALE';
    return null;
  }

  private detectSpecialCategory(normalized: string): string | null {
    if (/(imovel|imovel|casa|apartamento|housing|moradia)/i.test(normalized)) return 'Habitação';
    if (/(credito|crédito|financiamento|emprestimo|empréstimo)/i.test(normalized)) return 'Crédito';
    if (/(vaga|emprego|recrutamento)/i.test(normalized)) return 'Emprego';
    return null;
  }

  private detectPlacements(normalized: string): CampaignPlacement[] {
    const placements: CampaignPlacement[] = [];
    if (/(feed)/i.test(normalized)) placements.push('feed');
    if (/(stories|story)/i.test(normalized)) placements.push('stories');
    if (/(reels|reel)/i.test(normalized)) placements.push('reels');
    if (/(explore|explorar)/i.test(normalized)) placements.push('explore');
    if (/(messenger)/i.test(normalized)) placements.push('messenger');
    if (/(audience network|rede de audiencia|rede de audiência)/i.test(normalized)) placements.push('audience_network');
    return placements.length ? placements : this.state.placements.selected;
  }

  private detectWeekDays(normalized: string): string[] {
    const mapping: Array<{ pattern: RegExp; code: string }> = [
      { pattern: /segunda/, code: 'Mon' },
      { pattern: /terca|terça/, code: 'Tue' },
      { pattern: /quarta/, code: 'Wed' },
      { pattern: /quinta/, code: 'Thu' },
      { pattern: /sexta/, code: 'Fri' },
      { pattern: /sabado|sábado/, code: 'Sat' },
      { pattern: /domingo/, code: 'Sun' },
    ];
    const detected = mapping.filter((item) => item.pattern.test(normalized)).map((item) => item.code);
    if (/segunda a sexta/i.test(normalized)) return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    return detected;
  }

  private detectOptimizationGoal(normalized: string): string | null {
    if (/(lead|cadastro)/i.test(normalized)) return 'Leads';
    if (/(compra|purchase|venda)/i.test(normalized)) return 'Conversions';
    if (/(alcance|impress)/i.test(normalized)) return 'Reach';
    if (/(clique|trafego|tráfego|visita)/i.test(normalized)) return 'Link clicks';
    return null;
  }

  private detectBillingEvent(normalized: string): string | null {
    if (/(clique|click)/i.test(normalized)) return 'Clicks';
    if (/(impress)/i.test(normalized)) return 'Impressions';
    return null;
  }

  private detectConversionWindow(normalized: string): string | null {
    if (/1 dia|1-day/i.test(normalized)) return '1-day click';
    if (/7 dias|7-day/i.test(normalized)) return '7-day click';
    if (/view/i.test(normalized)) return '1-day view';
    return null;
  }

  private detectPrimaryLanguage(normalized: string): string | null {
    if (/(ingles|inglês|english)/i.test(normalized)) return 'Inglês';
    if (/(espanhol|spanish)/i.test(normalized)) return 'Espanhol';
    if (/(portugues|português)/i.test(normalized)) return 'Português';
    return null;
  }

  private detectInterestFallback(normalized: string): string {
    if (/(moda|roupa|vestuario|vestuário|beleza)/i.test(normalized)) return 'moda feminina, compras online, beleza, lookalike de compradores';
    if (/(imovel|casa|apartamento|moradia)/i.test(normalized)) return 'imóveis, financiamento, intenção de compra de imóvel';
    if (/(clinica|clínica|saude|saúde|estetica|estética)/i.test(normalized)) return 'saúde, estética, bem-estar, agendamento';
    if (/(curso|educacao|educação|mentoria)/i.test(normalized)) return 'educação online, cursos, desenvolvimento profissional';
    return 'compras online, intenção de compra, remarketing';
  }

  private buildAiCampaignName(): string {
    const objective = this.selectedObjectiveLabel();
    const city = this.state.audience.city.trim();
    const focus = city ? `${objective} ${city}` : objective;
    return `IA | ${this.selectedStoreName()} | ${focus}`;
  }

  private buildAiHeadline(): string {
    if (this.state.destination.type === 'messages') return 'Fale com a nossa equipe e avance agora';
    if (this.state.campaign.objective === 'OUTCOME_LEADS') return 'Peça sua proposta e receba atendimento rápido';
    if (this.state.campaign.objective === 'REACH') return 'Descubra a marca certa para o seu momento';
    return 'Conheça a oferta certa para seguir adiante';
  }

  private buildAiDescription(): string {
    return `${this.selectedObjectiveLabel()} com leitura clara de público, oferta e próximo passo.`;
  }

  private buildAiMessage(): string {
    const place = this.state.audience.city.trim() || this.state.audience.country.trim().toUpperCase();
    if (this.state.destination.type === 'messages') {
      return `Campanha criada para gerar conversas qualificadas em ${place}, com mensagem direta, CTA forte e foco em resposta rápida.`;
    }
    return `Campanha criada para ${this.selectedObjectiveLabel().toLowerCase()} em ${place}, com foco em clareza de oferta, público aderente e avanço até o destino final.`;
  }

  private buildAiInterestFallback(): string {
    return this.detectInterestFallback(this.normalizeText(this.state.ui.aiPrompt));
  }

  private defaultEventForObjective(objective: CampaignObjective): string {
    if (objective === 'OUTCOME_LEADS') return 'Lead';
    if (objective === 'REACH') return 'ViewContent';
    return 'PageView';
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private parseDecimal(value: string): number {
    return Number(value.replace(/\./g, '').replace(',', '.'));
  }

  private toTitleCase(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
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
      const safeKeyword = this.normalizeText(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`${safeKeyword}\\s*[:|-]\\s*([^\\n.]{3,220})`, 'i');
      const match = this.normalizeText(prompt).match(pattern);
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
    const normalized = this.normalizeText(prompt);
    return this.internalAdAccounts().find((account) =>
      normalized.includes(this.normalizeText(account.name)) ||
      normalized.includes(this.normalizeText(account.externalId || account.metaId || account.id)),
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
    return !!this.integration()?.pageId;
  }

  private hasSyncedAdAccounts(): boolean {
    return this.internalAdAccounts().length > 0;
  }

  private realPayloadComplete(): boolean {
    return !!this.state.campaign.name.trim()
      && !!this.state.campaign.objective.trim()
      && Number(this.state.budget.value) > 0
      && this.isValidCountry(this.state.audience.country)
      && !!this.state.identity.adAccountId
      && !!this.state.creative.message.trim()
      && this.isValidImageUrl(this.state.creative.imageUrl);
  }

  private generalSectionComplete(): boolean {
    return !!this.state.campaign.name.trim() && !!this.state.campaign.objective.trim();
  }

  private identitySectionComplete(): boolean {
    return !!this.storeContext.getValidSelectedStoreId()
      && this.isIntegrationConnected()
      && this.hasConfiguredPage()
      && !!this.state.identity.adAccountId;
  }

  private audienceSectionComplete(): boolean {
    return this.isValidCountry(this.state.audience.country)
      && Number(this.state.audience.ageMin) > 0
      && Number(this.state.audience.ageMax) >= Number(this.state.audience.ageMin);
  }

  private budgetSectionComplete(): boolean {
    return Number(this.state.budget.value) > 0;
  }

  private scheduleSectionComplete(): boolean {
    return !!this.state.schedule.startDate && !!this.state.schedule.startTime;
  }

  private placementSectionComplete(): boolean {
    return this.state.placements.selected.length > 0;
  }

  private destinationSectionComplete(): boolean {
    if (this.state.destination.type === 'site') {
      return !!this.state.destination.websiteUrl.trim();
    }
    return true;
  }

  private creativeSectionComplete(): boolean {
    return !!this.state.creative.message.trim() && this.isValidImageUrl(this.state.creative.imageUrl);
  }

  private trackingSectionComplete(): boolean {
    return !!this.state.tracking.mainEvent.trim();
  }

  private isValidCountry(value: string): boolean {
    return /^[A-Z]{2}$/i.test((value || '').trim());
  }

  private isValidImageUrl(value: string): boolean {
    const trimmed = (value || '').trim();
    if (!trimmed) return false;
    try {
      const parsed = new URL(trimmed);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  private formatCurrency(value: number): string {
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
