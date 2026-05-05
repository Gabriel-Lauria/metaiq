import { IntegrationProvider, IntegrationStatus, SyncStatus } from '../../core/models';
import { buildInitialCampaignBuilderState } from './campaign-builder.initial-state';
import { META_MESSAGES_PUBLISH_SCOPE_MESSAGE, buildApiPayload, buildReviewSignals, canSubmit, fieldInvalid } from './campaign-builder-review.util';

describe('buildApiPayload', () => {
  function buildState() {
    const state = buildInitialCampaignBuilderState();
    state.campaign.name = 'Campanha CTA';
    state.identity.adAccountId = 'ad-account-1';
    state.destination.websiteUrl = 'https://metaiq.dev/oferta';
    state.creative.message = 'Mensagem principal';
    state.creative.imageUrl = 'https://metaiq.dev/image.jpg';
    return state;
  }

  it('normaliza labels legados de CTA para enums da Meta', () => {
    const state = buildState();
    state.creative.cta = 'Saiba mais' as any;

    const payload = buildApiPayload(state);

    expect(payload.cta).toBe('LEARN_MORE');
  });

  it('usa LEARN_MORE quando o CTA legado vier vazio', () => {
    const state = buildState();
    state.creative.cta = '' as any;

    const payload = buildApiPayload(state);

    expect(payload.cta).toBe('LEARN_MORE');
  });

  it('preserva um enum tecnico valido', () => {
    const state = buildState();
    state.creative.cta = 'CONTACT_US';

    const payload = buildApiPayload(state);

    expect(payload.cta).toBe('CONTACT_US');
  });

  it('omite description vazia e preserva headline apenas quando preenchida', () => {
    const state = buildState();
    state.creative.headline = '  Headline valida  ';
    state.creative.description = '   ';

    const payload = buildApiPayload(state);

    expect(payload.headline).toBe('Headline valida');
    expect(payload.description).toBeUndefined();
  });

  it('inclui localizacao padronizada quando estado e cidade forem definidos', () => {
    const state = buildState();
    state.audience.state = 'PR';
    state.audience.stateName = 'Paraná';
    state.audience.region = 'Paraná';
    state.audience.city = 'Curitiba';
    state.audience.cityId = 4106902;

    const payload = buildApiPayload(state);

    expect(payload.state).toBe('PR');
    expect(payload.stateName).toBe('Paraná');
    expect(payload.city).toBe('Curitiba');
    expect(payload.cityId).toBe(4106902);
  });
  it('envia schedule, placements, tracking e special category para o backend real', () => {
    const state = buildState();
    state.creative.assetId = 'asset-1';
    state.campaign.objective = 'OUTCOME_LEADS';
    state.campaign.specialCategory = 'Housing';
    state.schedule.endDate = '2026-05-08';
    state.schedule.endTime = '22:00';
    state.placements.selected = ['feed', 'stories', 'feed'];
    state.tracking.pixel = 'pixel-123';
    state.tracking.mainEvent = 'Purchase';
    state.tracking.utmCampaign = 'maio-oferta';

    const payload = buildApiPayload(state);

    expect(payload.imageAssetId).toBe('asset-1');
    expect(payload.assetId).toBe('asset-1');
    expect(payload.endTime).toBe('2026-05-08T22:00:00');
    expect(payload.pixelId).toBe('pixel-123');
    expect(payload.conversionEvent).toBe('Purchase');
    expect(payload.placements).toEqual(['feed', 'stories']);
    expect(payload.specialAdCategories).toEqual(['HOUSING']);
    expect(payload.utmCampaign).toBe('maio-oferta');
  });
});

describe('buildReviewSignals', () => {
  function buildState() {
    const state = buildInitialCampaignBuilderState();
    state.campaign.name = 'Campanha CTA';
    state.identity.adAccountId = 'ad-account-1';
    state.destination.websiteUrl = 'http://metaiq.dev/oferta';
    state.creative.message = 'Mensagem principal com detalhamento suficiente para revisar.';
    state.creative.imageUrl = 'https://www.google.com/imgres?imgurl=https://metaiq.dev/image.jpg';
    return state;
  }

  it('avisa sobre imageUrl nao direta, https e carousel sem bloquear toda a UX', () => {
    const state = buildState();
    state.creative.carousel = true;

    const signals = buildReviewSignals(state).map((signal) => signal.id);

    expect(signals).toContain('image-direct');
    expect(signals).toContain('destination-https');
    expect(signals).toContain('carousel');
    expect(signals).toContain('cta-format');
  });

  it('rejeita hosts instaveis de preview do Google para imageUrl', () => {
    const state = buildState();
    state.creative.imageUrl = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:demo';

    expect(fieldInvalid(state, 'creative.imageUrl')).toBeTrue();
    expect(buildReviewSignals(state).map((signal) => signal.id)).toContain('image-direct');
  });

  it('passa a exigir https e headline para envio real', () => {
    const state = buildState();
    state.destination.websiteUrl = 'http://metaiq.dev/oferta';
    state.creative.headline = '';

    expect(fieldInvalid(state, 'destination.websiteUrl')).toBeTrue();
    expect(fieldInvalid(state, 'creative.headline')).toBeTrue();
    expect(buildReviewSignals(state).map((signal) => signal.id)).toContain('headline-required');
  });

  it('mantem bloqueio explicito para campanhas de mensagens no fluxo atual de publicacao', () => {
    const state = buildState();
    state.destination.type = 'messages';
    state.destination.websiteUrl = '';
    state.destination.messagesDestination = 'WhatsApp Business';

    const signals = buildReviewSignals(state);

    expect(signals.map((signal) => signal.id)).toContain('destination-type');
    expect(signals.find((signal) => signal.id === 'destination-type')?.label).toBe(META_MESSAGES_PUBLISH_SCOPE_MESSAGE);
  });
});

describe('canSubmit', () => {
  it('bloqueia envio quando a URL nao usa https ou a headline esta vazia', () => {
    const state = buildInitialCampaignBuilderState();
    state.campaign.name = 'Campanha segura';
    state.campaign.objective = 'OUTCOME_LEADS';
    state.identity.adAccountId = 'ad-account-1';
    state.audience.country = 'BR';
    state.audience.state = 'PR';
    state.audience.stateName = 'Parana';
    state.audience.region = 'Parana';
    state.budget.value = 120;
    state.destination.websiteUrl = 'http://metaiq.dev/oferta';
    state.creative.message = 'Mensagem principal';
    state.creative.headline = '';
    state.creative.imageUrl = 'https://metaiq.dev/image.jpg';

    const context = {
      state,
      integration: {
        id: 'integration-1',
        storeId: 'store-1',
        provider: IntegrationProvider.META,
        status: IntegrationStatus.CONNECTED,
        lastSyncStatus: SyncStatus.SUCCESS,
        pageId: 'page-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      adAccounts: [{
        id: 'ad-account-1',
        name: 'Conta Meta',
        userId: 'user-1',
        provider: IntegrationProvider.META,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      selectedStoreId: 'store-1',
      validStoreId: 'store-1',
      selectedStoreName: 'Store teste',
      loadingContext: false,
      submitting: false,
      contextError: null,
      objectiveOptions: [{ value: 'OUTCOME_LEADS' as const, label: 'Leads' }],
      genderOptions: [{ value: 'ALL' as const, label: 'Todos' }],
    };

    expect(canSubmit(context)).toBeFalse();
  });

  it('bloqueia envio de campanhas de mensagens mesmo com restante do payload preenchido', () => {
    const state = buildInitialCampaignBuilderState();
    state.campaign.name = 'Campanha mensagens';
    state.campaign.objective = 'OUTCOME_LEADS';
    state.identity.adAccountId = 'ad-account-1';
    state.audience.country = 'BR';
    state.audience.state = 'PR';
    state.audience.stateName = 'Parana';
    state.audience.region = 'Parana';
    state.audience.city = 'Curitiba';
    state.audience.cityId = 4106902;
    state.budget.value = 120;
    state.destination.type = 'messages';
    state.destination.messagesDestination = 'WhatsApp Business';
    state.creative.message = 'Fale conosco para agendar.';
    state.creative.headline = 'Atendimento rapido';
    state.creative.imageUrl = 'https://metaiq.dev/image.jpg';
    state.placements.selected = ['feed'];
    state.tracking.mainEvent = 'Lead';
    state.tracking.pixel = 'pixel-123';

    const context = {
      state,
      integration: {
        id: 'integration-1',
        storeId: 'store-1',
        provider: IntegrationProvider.META,
        status: IntegrationStatus.CONNECTED,
        lastSyncStatus: SyncStatus.SUCCESS,
        pageId: 'page-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      adAccounts: [{
        id: 'ad-account-1',
        name: 'Conta Meta',
        userId: 'user-1',
        provider: IntegrationProvider.META,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      selectedStoreId: 'store-1',
      validStoreId: 'store-1',
      selectedStoreName: 'Store teste',
      loadingContext: false,
      submitting: false,
      contextError: null,
      objectiveOptions: [{ value: 'OUTCOME_LEADS' as const, label: 'Leads' }],
      genderOptions: [{ value: 'ALL' as const, label: 'Todos' }],
    };

    expect(canSubmit(context)).toBeFalse();
  });
});
