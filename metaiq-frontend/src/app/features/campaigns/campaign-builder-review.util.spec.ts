import { IntegrationProvider, IntegrationStatus, SyncStatus } from '../../core/models';
import { buildInitialCampaignBuilderState } from './campaign-builder.initial-state';
import { buildApiPayload, buildReviewSignals, canSubmit, fieldInvalid } from './campaign-builder-review.util';

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

  it('passa a exigir https e headline para envio real', () => {
    const state = buildState();
    state.destination.websiteUrl = 'http://metaiq.dev/oferta';
    state.creative.headline = '';

    expect(fieldInvalid(state, 'destination.websiteUrl')).toBeTrue();
    expect(fieldInvalid(state, 'creative.headline')).toBeTrue();
    expect(buildReviewSignals(state).map((signal) => signal.id)).toContain('headline-required');
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
});
