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

export function buildApiPayload(state: CampaignBuilderState): CreateMetaCampaignRequest {
  const destinationUrl = resolveDestinationUrl(state);
  const normalizedCta = normalizeCtaValue(state.creative.cta);
  const stateCode = state.audience.state.trim().toUpperCase();
  const stateName = state.audience.stateName.trim() || state.audience.region.trim();
  const city = state.audience.city.trim();
  const cityId = typeof state.audience.cityId === 'number' && state.audience.cityId > 0
    ? state.audience.cityId
    : undefined;

  return {
    name: state.campaign.name.trim(),
    objective: state.campaign.objective,
    dailyBudget: Number(state.budget.value),
    country: state.audience.country.trim().toUpperCase(),
    adAccountId: state.identity.adAccountId,
    message: normalizeCreativeText(state.creative.message),
    assetId: state.creative.assetId.trim() || undefined,
    imageUrl: normalizeCreativeText(state.creative.imageUrl),
    state: stateCode || undefined,
    stateName: stateName || undefined,
    city: city || undefined,
    cityId,
    destinationUrl: destinationUrl || undefined,
    headline: normalizeCreativeText(state.creative.headline) || undefined,
    description: normalizeCreativeText(state.creative.description) || undefined,
    cta: normalizedCta,
    initialStatus: state.campaign.initialStatus,
  };
}

export function cloneCampaignBuilderState(state: CampaignBuilderState): CampaignBuilderState {
  return JSON.parse(JSON.stringify(state)) as CampaignBuilderState;
}

export function realPayloadComplete(state: CampaignBuilderState): boolean {
  return !!state.campaign.name.trim()
    && !!state.campaign.objective.trim()
    && Number(state.budget.value) > 0
    && isValidCountry(state.audience.country)
    && hasConsistentAudienceLocation(state)
    && !!state.identity.adAccountId
    && state.destination.type === 'site'
    && isSecureHttpUrl(state.destination.websiteUrl)
    && !!state.creative.message.trim()
    && !!state.creative.headline.trim()
    && isLikelyDirectImageUrl(state.creative.imageUrl);
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
  return !!state.schedule.startDate && !!state.schedule.startTime;
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
    && isLikelyDirectImageUrl(state.creative.imageUrl);
}

export function trackingSectionComplete(state: CampaignBuilderState): boolean {
  return !!state.tracking.mainEvent.trim();
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

export function buildSimulatedMetrics(state: CampaignBuilderState): {
  reach: number;
  clicks: number;
  leads: number;
  cpl: number;
  ctr: number;
} {
  const baseBudget = Math.max(state.budget.value || 0, 1);
  const objectiveFactor = state.campaign.objective === 'OUTCOME_LEADS' ? 1.2 : state.campaign.objective === 'REACH' ? 2.1 : 1.6;
  const placementsFactor = Math.max(state.placements.selected.length, 1) / 3;
  const qualityFactor = state.creative.headline.trim() && state.creative.description.trim() ? 1.15 : 0.94;
  const reach = Math.round(baseBudget * 92 * objectiveFactor * placementsFactor);
  const clicks = Math.round(baseBudget * 4.8 * qualityFactor);
  const leads = Math.round(clicks * (state.campaign.objective === 'OUTCOME_LEADS' ? 0.18 : 0.07));
  return {
    reach,
    clicks,
    leads,
    cpl: leads > 0 ? +(baseBudget / leads).toFixed(2) : 0,
    ctr: reach > 0 ? +((clicks / reach) * 100).toFixed(2) : 0,
  };
}

export function buildReviewSignals(state: CampaignBuilderState): ReviewSignal[] {
  const signals: ReviewSignal[] = [];

  if (!realPayloadComplete(state)) {
    signals.push({ id: 'required', label: `Payload real incompleto: ${missingRealPayloadFields(state).join(', ')}.`, tone: 'warning' });
  } else {
    signals.push({ id: 'required-ok', label: 'Payload real pronto para o backend atual.', tone: 'success' });
  }

  if (!isValidImageUrl(state.creative.imageUrl)) {
    signals.push({ id: 'image-url', label: 'A imagem do criativo precisa estar enviada e acessível para a Meta.', tone: 'danger' });
  }

  if (state.creative.imageUrl.trim() && !isLikelyDirectImageUrl(state.creative.imageUrl)) {
    signals.push({ id: 'image-direct', label: 'A imagem selecionada não parece válida para envio à Meta. Reenvie o arquivo.', tone: 'danger' });
  }

  if (!isValidCountry(state.audience.country)) {
    signals.push({ id: 'country', label: 'País deve usar código ISO de 2 letras.', tone: 'warning' });
  }

  if (!hasConsistentAudienceLocation(state)) {
    signals.push({ id: 'location', label: 'Estado e cidade precisam estar consistentes. Se houver cidade, selecione uma UF válida antes de enviar.', tone: 'danger' });
  }

  if (state.budget.value < 20) {
    signals.push({ id: 'budget-low', label: 'Orçamento baixo pode limitar entrega e aprendizado.', tone: 'info' });
  }

  if (state.destination.type === 'site' && !state.destination.websiteUrl.trim()) {
    signals.push({ id: 'destination', label: 'URL de destino do site é obrigatória para criar na Meta.', tone: 'danger' });
  }

  if (state.destination.type === 'site' && state.destination.websiteUrl.trim() && !isValidHttpUrl(state.destination.websiteUrl)) {
    signals.push({ id: 'destination-invalid', label: 'URL de destino precisa ser absoluta e começar com http:// ou https://.', tone: 'danger' });
  }

  if (state.destination.type === 'site' && isValidHttpUrl(state.destination.websiteUrl) && !isSecureHttpUrl(state.destination.websiteUrl)) {
    signals.push({ id: 'destination-https', label: 'Use uma URL final segura começando com https://.', tone: 'danger' });
  }

  if (!state.creative.headline.trim()) {
    signals.push({ id: 'headline-required', label: 'Headline do criativo é obrigatória para criar a campanha na Meta.', tone: 'danger' });
  }

  if (state.destination.type !== 'site') {
    signals.push({ id: 'destination-type', label: 'O backend atual só cria campanhas com destino de site.', tone: 'danger' });
  }

  if (state.creative.headline.trim().length > 45) {
    signals.push({ id: 'headline-length', label: 'Headline longa demais pode perder impacto no feed e ser comprimida em placements menores.', tone: 'warning' });
  }

  if (state.creative.message.trim().length > 220) {
    signals.push({ id: 'message-length', label: 'Texto principal extenso pode reduzir clareza no primeiro olhar.', tone: 'info' });
  }

  if (!state.tracking.pixel.trim()) {
    signals.push({ id: 'pixel-missing', label: 'Pixel não configurado. Algumas campanhas podem não otimizar conversões corretamente.', tone: 'warning' });
  }

  if (state.creative.carousel) {
    signals.push({ id: 'carousel', label: 'Carousel ainda não é enviado no payload real da Meta. O creative será tratado como peça simples.', tone: 'warning' });
  }

  if (isLikelyDirectImageUrl(state.creative.imageUrl)) {
    signals.push({ id: 'image-hash-flow', label: 'A imagem será preparada no backend e enviada à Meta como asset com image_hash.', tone: 'info' });
  }

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
    !(Number(state.budget.value) > 0) ? 'orçamento' : '',
    !isValidCountry(state.audience.country) ? 'país' : '',
    !state.identity.adAccountId ? 'conta de anúncio' : '',
    state.destination.type !== 'site' || !isSecureHttpUrl(state.destination.websiteUrl) ? 'URL de destino https' : '',
    !state.creative.message.trim() ? 'mensagem' : '',
    !state.creative.headline.trim() ? 'headline' : '',
    !isLikelyDirectImageUrl(state.creative.imageUrl) ? 'imagem do criativo' : '',
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
    case 'creative.message':
      return !state.creative.message.trim();
    case 'creative.headline':
      return !state.creative.headline.trim();
    case 'creative.imageUrl':
      return !isLikelyDirectImageUrl(state.creative.imageUrl);
    case 'destination.websiteUrl':
      return state.destination.type === 'site' && !isSecureHttpUrl(state.destination.websiteUrl);
    default:
      return false;
  }
}

export function canSubmit(context: CampaignBuilderReviewContext): boolean {
  return !context.loadingContext
    && !context.submitting
    && buildReadinessItems(context).every((item) => item.done)
    && !fieldInvalid(context.state, 'creative.headline')
    && !fieldInvalid(context.state, 'creative.imageUrl')
    && !fieldInvalid(context.state, 'destination.websiteUrl');
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
  if (fieldInvalid(context.state, 'destination.websiteUrl')) return 'builder-destination';
  if (
    fieldInvalid(context.state, 'creative.message')
    || fieldInvalid(context.state, 'creative.headline')
    || fieldInvalid(context.state, 'creative.imageUrl')
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
  if (fieldInvalid(context.state, 'destination.websiteUrl')) return 'Use uma URL final segura começando com https://.';
  if (fieldInvalid(context.state, 'creative.headline')) return 'Preencha a headline do criativo antes de enviar para a Meta.';
  if (!realPayloadComplete(context.state)) return `Complete os campos reais antes do envio: ${missingRealPayloadFields(context.state).join(', ')}.`;
  return 'Tudo pronto para revisar e enviar.';
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
