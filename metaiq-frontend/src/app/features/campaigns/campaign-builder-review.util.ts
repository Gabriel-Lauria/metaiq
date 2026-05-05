import { AdAccount, CreateMetaCampaignRequest, IntegrationStatus, StoreIntegration } from '../../core/models';
import { getCtaLabelByValue, normalizeCtaValue } from './cta.constants';
import { isLikelyDirectImageUrl, isSecureHttpUrl, isValidHttpUrl, normalizeCreativeText } from './creative-validation.util';
import {
  CampaignBuilderState,
  CampaignDestinationType,
  CampaignGender,
  CampaignInitialStatus,
  CampaignObjective,
  CampaignPlacement,
  CreationReadinessItem,
  ReviewSignal,
  SectionProgress,
  SummaryRow,
} from './campaign-builder.types';

type ObjectiveOption = { value: CampaignObjective; label: string };
type GenderOption = { value: CampaignGender; label: string };

export const META_MESSAGES_PUBLISH_SCOPE_MESSAGE = 'Publicacao automatica indisponivel para campanhas de conversa no momento.';

export interface ExecutivePublishState {
  canPublish: boolean;
  title: string;
  message: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

export interface CampaignBuilderReviewContext {
  state: CampaignBuilderState;
  integration: StoreIntegration | null;
  adAccounts: AdAccount[];
  selectedStoreId: string | null | undefined;
  validStoreId: string | null | undefined;
  selectedStoreName: string;
  loadingContext: boolean;
  submitting: boolean;
  contextError: string | null;
  objectiveOptions: ObjectiveOption[];
  genderOptions: GenderOption[];
}

export function isIntegrationConnected(integration: StoreIntegration | null): boolean {
  return integration?.status === IntegrationStatus.CONNECTED;
}

export function hasConfiguredPage(integration: StoreIntegration | null): boolean {
  return !!integration?.pageId;
}

export function hasSyncedAdAccounts(adAccounts: AdAccount[]): boolean {
  return adAccounts.length > 0;
}

export function isValidCountry(value: string): boolean {
  return /^[A-Z]{2}$/i.test((value || '').trim());
}

export const isValidImageUrl = isValidHttpUrl;
export { isLikelyDirectImageUrl, isSecureHttpUrl, isValidHttpUrl };

export function resolveDestinationUrl(state: CampaignBuilderState): string {
  if (state.destination.type === 'site' && isSecureHttpUrl(state.destination.websiteUrl)) {
    return state.destination.websiteUrl.trim();
  }

  return '';
}

export function resolveScheduleWindow(state: CampaignBuilderState): { startTime: string | null; endTime: string | null } {
  const startDate = state.schedule.startDate.trim();
  const startClock = state.schedule.startTime.trim();
  const endDate = state.schedule.endDate.trim();
  const endClock = state.schedule.endTime.trim();

  const startTime = buildIsoDateTime(startDate, startClock);
  const endTime = buildIsoDateTime(endDate, endClock);

  return { startTime, endTime };
}

export function buildApiPayload(state: CampaignBuilderState): CreateMetaCampaignRequest {
  const destinationUrl = resolveDestinationUrl(state);
  const normalizedCta = normalizeCtaValue(state.creative.cta);
  const stateCode = state.audience.state.trim().toUpperCase();
  const stateName = state.audience.stateName.trim() || state.audience.region.trim();
  const city = state.audience.city.trim();
  const cityId = typeof state.audience.cityId === 'number' && state.audience.cityId > 0
    ? state.audience.cityId
    : undefined;
  const schedule = resolveScheduleWindow(state);
  const specialAdCategories = normalizeSpecialAdCategories(state.campaign.specialCategory);
  const placements = Array.from(new Set(
    state.placements.selected
      .map((item) => item.trim())
      .filter(Boolean),
  ));
  const imageAssetId = state.creative.imageAssetId.trim() || undefined;

  return {
    name: state.campaign.name.trim(),
    objective: state.campaign.objective,
    dailyBudget: Number(state.budget.value),
    startTime: schedule.startTime || '',
    endTime: schedule.endTime || undefined,
    country: state.audience.country.trim().toUpperCase(),
    ageMin: Number(state.audience.ageMin),
    ageMax: Number(state.audience.ageMax),
    gender: state.audience.gender,
    adAccountId: state.identity.adAccountId,
    message: normalizeCreativeText(state.creative.message),
    imageAssetId,
    assetId: imageAssetId,
    imageUrl: imageAssetId ? undefined : normalizeCreativeText(state.creative.imageUrl),
    state: stateCode || undefined,
    stateName: stateName || undefined,
    city: city || undefined,
    cityId,
    destinationUrl: destinationUrl || undefined,
    headline: normalizeCreativeText(state.creative.headline) || undefined,
    description: normalizeCreativeText(state.creative.description) || undefined,
    cta: normalizedCta,
    pixelId: state.tracking.pixel.trim() || undefined,
    conversionEvent: state.tracking.mainEvent.trim() || undefined,
    placements: placements.length ? placements : undefined,
    specialAdCategories: specialAdCategories.length ? specialAdCategories : undefined,
    utmSource: state.tracking.utmSource.trim() || undefined,
    utmMedium: state.tracking.utmMedium.trim() || undefined,
    utmCampaign: state.tracking.utmCampaign.trim() || undefined,
    utmContent: state.tracking.utmContent.trim() || undefined,
    utmTerm: state.tracking.utmTerm.trim() || undefined,
    initialStatus: 'PAUSED',
  };
}

function normalizeSpecialAdCategories(value: string): string[] {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');

  if (!normalized || normalized === 'NENHUMA' || normalized === 'NONE') {
    return [];
  }

  return [normalized];
}

export function cloneCampaignBuilderState(state: CampaignBuilderState): CampaignBuilderState {
  return JSON.parse(JSON.stringify(state)) as CampaignBuilderState;
}

export function realPayloadComplete(state: CampaignBuilderState): boolean {
  return !!state.campaign.name.trim()
    && !!state.campaign.objective.trim()
    && Number(state.budget.value) > 0
    && hasValidSchedule(state)
    && isValidCountry(state.audience.country)
    && hasConsistentAudienceLocation(state)
    && !!state.identity.adAccountId
    && state.destination.type === 'site'
    && isSecureHttpUrl(state.destination.websiteUrl)
    && !!state.creative.message.trim()
    && !!state.creative.headline.trim()
    && !!state.creative.imageAssetId.trim()
    && hasSemanticallySupportedObjective(state)
    && hasTrackingRequiredForObjective(state);
}

function executiveAnalysisForPublish(state: CampaignBuilderState) {
  if (state.ui.aiCopilotStale) {
    return null;
  }

  return state.ui.aiCopilotAnalysis?.analysis || null;
}

export function executivePublishState(state: CampaignBuilderState): ExecutivePublishState | null {
  const analysis = executiveAnalysisForPublish(state);

  if (!analysis) {
    return null;
  }

  if (analysis.riskLevel === 'CRITICAL') {
    return {
      canPublish: false,
      title: 'Corrija antes de publicar',
      message: 'Esta campanha ainda nao esta segura para publicar.',
      tone: 'danger',
    };
  }

  if (analysis.executiveDecision.decision === 'BLOCK') {
    return {
      canPublish: false,
      title: 'Corrija antes de publicar',
      message: 'Corrija os pontos abaixo antes de gastar dinheiro.',
      tone: 'danger',
    };
  }

  if (analysis.isReadyToPublish === false) {
    return {
      canPublish: false,
      title: 'Corrija antes de publicar',
      message: 'Esta campanha ainda nao esta segura para publicar.',
      tone: 'danger',
    };
  }

  if (analysis.executiveDecision.decision === 'REVIEW') {
    return {
      canPublish: false,
      title: 'Revise antes de publicar',
      message: 'A IA recomenda revisar esta campanha antes da publicacao.',
      tone: 'warning',
    };
  }

  if (analysis.executiveDecision.decision === 'RESTRUCTURE') {
    return {
      canPublish: false,
      title: 'Ajuste a campanha antes de publicar',
      message: 'Esta campanha precisa de ajustes maiores antes de publicar.',
      tone: 'warning',
    };
  }

  if (analysis.executiveDecision.decision === 'PUBLISH') {
    return {
      canPublish: true,
      title: 'Campanha liberada pela analise',
      message: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
      tone: 'success',
    };
  }

  return null;
}

export function executivePublishBlockMessage(state: CampaignBuilderState): string | null {
  const publishState = executivePublishState(state);
  return publishState && !publishState.canPublish ? publishState.message : null;
}

export function hasExecutivePublishBlock(state: CampaignBuilderState): boolean {
  const publishState = executivePublishState(state);
  return !!publishState && !publishState.canPublish;
}

export function generalSectionComplete(state: CampaignBuilderState): boolean {
  return !!state.campaign.name.trim() && !!state.campaign.objective.trim();
}

export function identitySectionComplete(context: CampaignBuilderReviewContext): boolean {
  return !!context.validStoreId
    && isIntegrationConnected(context.integration)
    && hasConfiguredPage(context.integration)
    && !!context.state.identity.adAccountId;
}

export function audienceSectionComplete(state: CampaignBuilderState): boolean {
  return isValidCountry(state.audience.country)
    && hasConsistentAudienceLocation(state)
    && Number(state.audience.ageMin) > 0
    && Number(state.audience.ageMax) >= Number(state.audience.ageMin);
}

export function budgetSectionComplete(state: CampaignBuilderState): boolean {
  return Number(state.budget.value) > 0;
}

export function scheduleSectionComplete(state: CampaignBuilderState): boolean {
  return hasValidSchedule(state);
}

export function placementSectionComplete(state: CampaignBuilderState): boolean {
  return state.placements.selected.length > 0;
}

export function destinationSectionComplete(state: CampaignBuilderState): boolean {
  if (state.destination.type === 'site') {
    return isSecureHttpUrl(state.destination.websiteUrl);
  }
  return false;
}

export function creativeSectionComplete(state: CampaignBuilderState): boolean {
  return !!state.creative.message.trim()
    && !!state.creative.headline.trim()
    && !!state.creative.imageAssetId.trim();
}

export function trackingSectionComplete(state: CampaignBuilderState): boolean {
  return !!state.tracking.mainEvent.trim() && hasTrackingRequiredForObjective(state);
}

export function aiSectionComplete(state: CampaignBuilderState): boolean {
  return state.ui.aiApplied || !!state.ui.aiPrompt.trim();
}

export function selectedPageName(integration: StoreIntegration | null): string {
  return integration?.pageName || integration?.pageId || 'Página não configurada';
}

export function selectedAdAccountName(adAccounts: AdAccount[], adAccountId: string): string {
  const account = adAccounts.find((item) => item.id === adAccountId);
  return account ? `${account.name} · ${account.externalId || account.metaId || account.id}` : 'Conta não selecionada';
}

export function selectedObjectiveLabel(objectiveOptions: ObjectiveOption[], objective: CampaignObjective): string {
  return objectiveOptions.find((option) => option.value === objective)?.label || 'Não definido';
}

export function audienceSummary(state: CampaignBuilderState, genderOptions: GenderOption[]): string {
  const country = state.audience.country.trim().toUpperCase() || '--';
  const ageRange = `${state.audience.ageMin}-${state.audience.ageMax}`;
  const gender = genderOptions.find((option) => option.value === state.audience.gender)?.label || 'Todos';
  const location = [
    state.audience.city.trim(),
    state.audience.stateName.trim() || state.audience.region.trim(),
  ].filter(Boolean).join(' · ') || 'cidade aberta';
  return `${country} · ${location} · ${ageRange} anos · ${gender}`;
}

export function destinationSummary(state: CampaignBuilderState): string {
  switch (state.destination.type) {
    case 'site':
      return state.destination.websiteUrl.trim() || 'site sem URL';
    case 'messages':
      return state.destination.messagesDestination.trim() || 'mensagens';
    case 'form':
      return state.destination.formName.trim() || 'formulário';
    case 'app':
      return state.destination.appLink.trim() || 'app';
    default:
      return state.destination.catalogId.trim() || 'catálogo';
  }
}

export function trackingSummary(state: CampaignBuilderState): string {
  return [
    state.tracking.pixel.trim() || 'sem pixel',
    state.tracking.mainEvent.trim() || 'sem evento',
    state.tracking.utmCampaign.trim() || 'sem UTM',
  ].join(' · ');
}

export function buildSectionProgress(context: CampaignBuilderReviewContext): SectionProgress[] {
  return [
    { id: 'builder-ai', label: 'IA por prompt', done: aiSectionComplete(context.state) },
    { id: 'builder-general', label: 'Dados gerais', done: generalSectionComplete(context.state) },
    { id: 'builder-identity', label: 'Conta e identidade', done: identitySectionComplete(context) },
    { id: 'builder-audience', label: 'Público', done: audienceSectionComplete(context.state) },
    { id: 'builder-budget', label: 'Orçamento e lance', done: budgetSectionComplete(context.state) },
    { id: 'builder-schedule', label: 'Agenda', done: scheduleSectionComplete(context.state) },
    { id: 'builder-placements', label: 'Posicionamentos', done: placementSectionComplete(context.state) },
    { id: 'builder-destination', label: 'Destino', done: destinationSectionComplete(context.state) },
    { id: 'builder-creative', label: 'Criativo', done: creativeSectionComplete(context.state) },
    { id: 'builder-tracking', label: 'Rastreamento', done: trackingSectionComplete(context.state) },
    { id: 'builder-review', label: 'Revisão', done: canSubmit(context) },
  ];
}

export function buildReadinessItems(context: CampaignBuilderReviewContext): CreationReadinessItem[] {
  return [
    { id: 'store-selected', label: 'Existe uma store selecionada', done: !!context.selectedStoreId },
    { id: 'store-valid', label: 'A store selecionada é válida para o usuário atual', done: !!context.validStoreId },
    { id: 'integration', label: 'A integração Meta da store está conectada', done: isIntegrationConnected(context.integration) },
    { id: 'page', label: 'A store possui página Meta configurada', done: hasConfiguredPage(context.integration) },
    { id: 'accounts', label: 'Existem contas de anúncio sincronizadas', done: hasSyncedAdAccounts(context.adAccounts) },
    { id: 'fields', label: 'Os campos reais obrigatórios estão preenchidos', done: realPayloadComplete(context.state) },
  ];
}

export function buildSummaryRows(context: CampaignBuilderReviewContext, formatCurrency: (value: number) => string): SummaryRow[] {
  return [
    { label: 'Store', value: context.selectedStoreName },
    { label: 'Campanha', value: context.state.campaign.name.trim() || 'Sem nome ainda' },
    { label: 'Objetivo', value: selectedObjectiveLabel(context.objectiveOptions, context.state.campaign.objective) },
    { label: 'Conta', value: selectedAdAccountName(context.adAccounts, context.state.identity.adAccountId) },
    { label: 'Página', value: selectedPageName(context.integration) },
    { label: 'Orçamento', value: `${formatCurrency(context.state.budget.value)}/${context.state.budget.budgetType === 'daily' ? 'dia' : 'campanha'}` },
    { label: 'Público', value: audienceSummary(context.state, context.genderOptions) },
    { label: 'CTA / destino', value: `${getCtaLabelByValue(context.state.creative.cta)} · ${destinationSummary(context.state)}` },
    { label: 'Rastreamento', value: trackingSummary(context.state) },
  ];
}

export function buildReviewSignals(state: CampaignBuilderState): ReviewSignal[] {
  const signals: ReviewSignal[] = [];
  const publishState = executivePublishState(state);

  if (!realPayloadComplete(state)) {
    signals.push({ id: 'required', label: `Faltam dados obrigatorios para publicar: ${missingRealPayloadFields(state).join(', ')}.`, tone: 'warning' });
  } else {
    signals.push({ id: 'required-ok', label: 'Os dados obrigatorios para publicar foram preenchidos.', tone: 'success' });
  }

  if (!state.creative.imageAssetId.trim()) {
    signals.push({ id: 'image-asset', label: 'Envie uma imagem válida para continuar.', tone: 'danger' });
  }

  if (state.creative.imageUrl.trim() && !state.creative.imageAssetId.trim()) {
    signals.push({ id: 'image-url-deprecated', label: 'imageUrl manual está depreciado. Use o upload da imagem para gerar image_hash.', tone: 'warning' });
  }

  if (!isValidCountry(state.audience.country)) {
    signals.push({ id: 'country', label: 'País deve usar código ISO de 2 letras.', tone: 'warning' });
  }

  if (!hasConsistentAudienceLocation(state)) {
    signals.push({ id: 'location', label: 'Estado e cidade precisam estar consistentes. Se houver cidade, selecione uma UF válida antes de enviar.', tone: 'danger' });
  }

  if (!(Number(state.audience.ageMin) >= 13) || !(Number(state.audience.ageMax) >= Number(state.audience.ageMin))) {
    signals.push({ id: 'age-range', label: 'Faixa etária inválida para publicação real.', tone: 'danger' });
  }

  if (state.budget.value < 20) {
    signals.push({ id: 'budget-low', label: 'Orçamento baixo pode limitar entrega e aprendizado.', tone: 'info' });
  }

  if (!hasValidSchedule(state)) {
    signals.push({ id: 'schedule-invalid', label: 'Defina uma data e hora de início válidas. Se houver término, ele deve acontecer depois do início.', tone: 'danger' });
  }

  if (!hasSemanticallySupportedObjective(state)) {
    signals.push({ id: 'objective-unsupported', label: `O objetivo ${state.campaign.objective} ainda não está liberado para publicação segura neste fluxo.`, tone: 'danger' });
  }

  if (state.destination.type === 'site' && !state.destination.websiteUrl.trim()) {
    signals.push({ id: 'destination', label: 'URL de destino do site é obrigatória para criar na Meta.', tone: 'danger' });
  }

  if (state.destination.type === 'site' && state.destination.websiteUrl.trim() && !isValidHttpUrl(state.destination.websiteUrl)) {
    signals.push({ id: 'destination-invalid', label: 'URL de destino precisa ser absoluta e começar com http:// ou https://.', tone: 'danger' });
  }

  if (state.destination.type === 'site' && isValidHttpUrl(state.destination.websiteUrl) && !isSecureHttpUrl(state.destination.websiteUrl)) {
    signals.push({ id: 'destination-https', label: 'Use um link seguro com https:// antes de publicar.', tone: 'danger' });
  }

  if (!state.creative.headline.trim()) {
    signals.push({ id: 'headline-required', label: 'Headline do criativo é obrigatória para criar a campanha na Meta.', tone: 'danger' });
  }

  if (state.destination.type !== 'site') {
    signals.push({ id: 'destination-type', label: META_MESSAGES_PUBLISH_SCOPE_MESSAGE, tone: 'danger' });
  }

  if (publishState && !publishState.canPublish) {
    signals.push({ id: 'executive-review', label: publishState.message, tone: publishState.tone === 'danger' ? 'danger' : 'warning' });
  }

  if (state.creative.headline.trim().length > 45) {
    signals.push({ id: 'headline-length', label: 'Headline longa demais pode perder impacto no feed e ser comprimida em placements menores.', tone: 'warning' });
  }

  if (state.creative.message.trim().length > 220) {
    signals.push({ id: 'message-length', label: 'Texto principal extenso pode reduzir clareza no primeiro olhar.', tone: 'info' });
  }

  if (objectiveRequiresPixel(state) && !state.tracking.pixel.trim()) {
    signals.push({ id: 'pixel-required', label: 'Este objetivo exige pixel configurado antes da publicação.', tone: 'danger' });
  } else if (!state.tracking.pixel.trim()) {
    signals.push({ id: 'pixel-missing', label: 'Pixel não configurado. Algumas campanhas podem não otimizar conversões corretamente.', tone: 'warning' });
  }

  if (!state.placements.selected.length) {
    signals.push({ id: 'placements-required', label: 'Selecione pelo menos um posicionamento para controlar a entrega real da campanha.', tone: 'danger' });
  }

  if (state.audience.interests.trim() || state.audience.behaviors.trim() || state.audience.demographics.trim()) {
    signals.push({
      id: 'unsupported-audience-fields',
      label: 'Interesses, behaviors e demographics foram removidos do publish real até existir suporte seguro na Meta.',
      tone: 'warning',
    });
  }

  if (!state.tracking.mainEvent.trim()) {
    signals.push({ id: 'conversion-event-required', label: 'Defina o evento principal de rastreamento antes de publicar.', tone: 'danger' });
  }

  if (state.creative.carousel) {
    signals.push({ id: 'carousel', label: 'Carousel ainda não é enviado no payload real da Meta. O creative será tratado como peça simples.', tone: 'warning' });
  }

  signals.push({ id: 'image-hash-flow', label: 'A imagem será publicada via asset com image_hash validado pela Meta.', tone: 'info' });

  signals.push({
    id: 'cta-format',
    label: `CTA será enviado no formato técnico compatível com a Meta: ${normalizeCtaValue(state.creative.cta)}.`,
    tone: 'info',
  });

  return signals;
}

export function missingRealPayloadFields(state: CampaignBuilderState): string[] {
  return [
    !state.campaign.name.trim() ? 'nome' : '',
    !state.campaign.objective.trim() ? 'objetivo' : '',
    !hasSemanticallySupportedObjective(state) ? 'objetivo suportado' : '',
    !(Number(state.budget.value) > 0) ? 'orçamento' : '',
    !hasValidSchedule(state) ? 'datas válidas' : '',
    !isValidCountry(state.audience.country) ? 'país' : '',
    !(Number(state.audience.ageMin) >= 13) ? 'idade mínima' : '',
    !(Number(state.audience.ageMax) >= Number(state.audience.ageMin)) ? 'idade máxima' : '',
    !state.identity.adAccountId ? 'conta de anúncio' : '',
    state.destination.type !== 'site' || !isSecureHttpUrl(state.destination.websiteUrl) ? 'URL de destino https' : '',
    !state.creative.message.trim() ? 'mensagem' : '',
    !state.creative.headline.trim() ? 'headline' : '',
    !state.creative.imageAssetId.trim() ? 'imagem enviada' : '',
    !state.placements.selected.length ? 'posicionamentos' : '',
    !state.tracking.mainEvent.trim() ? 'evento principal' : '',
    objectiveRequiresPixel(state) && !state.tracking.pixel.trim() ? 'pixel' : '',
  ].filter(Boolean);
}

export function fieldInvalid(state: CampaignBuilderState, field: string): boolean {
  switch (field) {
    case 'campaign.name':
      return !state.campaign.name.trim();
    case 'identity.adAccountId':
      return !state.identity.adAccountId;
    case 'audience.country':
      return !isValidCountry(state.audience.country);
    case 'audience.location':
      return !hasConsistentAudienceLocation(state);
    case 'budget.value':
      return !(Number(state.budget.value) > 0);
    case 'schedule.window':
      return !hasValidSchedule(state);
    case 'creative.message':
      return !state.creative.message.trim();
    case 'creative.headline':
      return !state.creative.headline.trim();
    case 'creative.imageAssetId':
      return !state.creative.imageAssetId.trim();
    case 'destination.websiteUrl':
      return state.destination.type === 'site' && !isSecureHttpUrl(state.destination.websiteUrl);
    case 'tracking.requirements':
      return !hasTrackingRequiredForObjective(state) || !state.placements.selected.length || !hasSemanticallySupportedObjective(state);
    default:
      return false;
  }
}

export function canSubmit(context: CampaignBuilderReviewContext): boolean {
  return !context.loadingContext
    && !context.submitting
    && buildReadinessItems(context).every((item) => item.done)
    && !fieldInvalid(context.state, 'schedule.window')
    && !fieldInvalid(context.state, 'creative.headline')
    && !fieldInvalid(context.state, 'creative.imageAssetId')
    && !fieldInvalid(context.state, 'destination.websiteUrl')
    && !fieldInvalid(context.state, 'tracking.requirements');
}

export function firstBlockingSectionId(context: CampaignBuilderReviewContext): string {
  if (context.contextError || !context.selectedStoreId || !context.validStoreId || !isIntegrationConnected(context.integration) || !hasConfiguredPage(context.integration) || !hasSyncedAdAccounts(context.adAccounts)) {
    return 'builder-identity';
  }

  if (fieldInvalid(context.state, 'campaign.name')) return 'builder-general';
  if (fieldInvalid(context.state, 'identity.adAccountId')) return 'builder-identity';
  if (fieldInvalid(context.state, 'audience.country')) return 'builder-audience';
  if (fieldInvalid(context.state, 'audience.location')) return 'builder-audience';
  if (fieldInvalid(context.state, 'budget.value')) return 'builder-budget';
  if (fieldInvalid(context.state, 'schedule.window')) return 'builder-schedule';
  if (fieldInvalid(context.state, 'destination.websiteUrl')) return 'builder-destination';
  if (fieldInvalid(context.state, 'tracking.requirements')) return 'builder-tracking';
  if (
    fieldInvalid(context.state, 'creative.message')
    || fieldInvalid(context.state, 'creative.headline')
    || fieldInvalid(context.state, 'creative.imageAssetId')
  ) {
    return 'builder-creative';
  }

  return 'builder-review';
}

export function blockerMessage(context: CampaignBuilderReviewContext): string {
  if (context.contextError) return context.contextError;
  if (context.loadingContext) return 'Carregando contexto da store, integração Meta e contas disponíveis.';
  if (!context.selectedStoreId) return 'Selecione uma store para iniciar a criação da campanha.';
  if (!context.validStoreId) return 'A store escolhida não pertence ao usuário atual. Selecione uma store válida.';
  if (!isIntegrationConnected(context.integration)) return 'Esta store ainda não está pronta para criação de campanhas. Conecte a Meta e configure a página primeiro.';
  if (!hasConfiguredPage(context.integration)) return 'Configure a Página do Facebook da loja antes de criar campanhas.';
  if (!hasSyncedAdAccounts(context.adAccounts)) return 'Sincronize as contas da store em Integrações para liberar a criação de campanhas.';
  if (fieldInvalid(context.state, 'audience.location')) return 'Selecione estado e cidade de forma consistente para evitar combinações geográficas inválidas.';
  if (fieldInvalid(context.state, 'schedule.window')) return 'Defina datas válidas para a campanha. O término, quando informado, deve acontecer depois do início.';
  if (context.state.destination.type !== 'site') return META_MESSAGES_PUBLISH_SCOPE_MESSAGE;
  if (fieldInvalid(context.state, 'destination.websiteUrl')) return 'Use uma URL final segura começando com https://.';
  if (!hasSemanticallySupportedObjective(context.state)) return 'Este objetivo ainda não está disponível para publicação segura neste fluxo.';
  if (!context.state.placements.selected.length) return 'Selecione pelo menos um posicionamento para controlar a entrega real na Meta.';
  if (!context.state.tracking.mainEvent.trim()) return 'Defina o evento principal de rastreamento antes de publicar.';
  if (objectiveRequiresPixel(context.state) && !context.state.tracking.pixel.trim()) return 'Campanhas de leads exigem pixel configurado antes da publicação.';
  if (fieldInvalid(context.state, 'creative.headline')) return 'Preencha a headline do criativo antes de enviar para a Meta.';
  if (fieldInvalid(context.state, 'creative.imageAssetId')) return 'Envie uma imagem válida para continuar.';
  if (!realPayloadComplete(context.state)) return `Complete os campos reais antes do envio: ${missingRealPayloadFields(context.state).join(', ')}.`;
  if (hasExecutivePublishBlock(context.state)) return executivePublishBlockMessage(context.state) || 'Revise a campanha antes de publicar.';
  return 'Tudo pronto para revisar e enviar.';
}

export function hasValidSchedule(state: CampaignBuilderState): boolean {
  const { startTime, endTime } = resolveScheduleWindow(state);
  if (!startTime) {
    return false;
  }

  const startTimestamp = Date.parse(startTime);
  if (!Number.isFinite(startTimestamp)) {
    return false;
  }

  if (!endTime) {
    return true;
  }

  const endTimestamp = Date.parse(endTime);
  return Number.isFinite(endTimestamp) && endTimestamp > startTimestamp;
}

function buildIsoDateTime(date: string, clock: string): string | null {
  if (!date || !clock) {
    return null;
  }

  const candidate = `${date}T${clock}:00`;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

export function hasConsistentAudienceLocation(state: CampaignBuilderState): boolean {
  if (state.ui.aiGeoPendingNotice) {
    return false;
  }

  const stateCode = state.audience.state.trim().toUpperCase();
  const stateName = state.audience.stateName.trim() || state.audience.region.trim();
  const city = state.audience.city.trim();
  const cityId = state.audience.cityId;

  if (!city && !cityId && !stateCode && !stateName) {
    return true;
  }

  if ((city || cityId) && !stateCode) {
    return false;
  }

  if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) {
    return false;
  }

  if (cityId != null && !(Number(cityId) > 0)) {
    return false;
  }

  if (stateCode && !stateName) {
    return false;
  }

  return true;
}

function objectiveRequiresPixel(state: CampaignBuilderState): boolean {
  return state.campaign.objective === 'OUTCOME_LEADS';
}

function hasTrackingRequiredForObjective(state: CampaignBuilderState): boolean {
  if (!state.tracking.mainEvent.trim()) {
    return false;
  }

  if (objectiveRequiresPixel(state)) {
    return !!state.tracking.pixel.trim();
  }

  return true;
}

function hasSemanticallySupportedObjective(state: CampaignBuilderState): boolean {
  return ['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'REACH'].includes(state.campaign.objective);
}
