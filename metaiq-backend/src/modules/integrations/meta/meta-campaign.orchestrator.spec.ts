import { MetaCampaignOrchestrator } from './meta-campaign.orchestrator';
import { CreateMetaCampaignDto } from './dto/meta-integration.dto';

describe('MetaCampaignOrchestrator', () => {
  it('sends an explicit advantage audience flag when creating adsets', async () => {
    const graphApi = {
      post: jest
        .fn()
        .mockResolvedValueOnce({ id: 'campaign-1' })
        .mockResolvedValueOnce({ id: 'adset-1' })
        .mockResolvedValueOnce({ id: 'creative-1' })
        .mockResolvedValueOnce({ id: 'ad-1' }),
    };
    const metaImageUpload = {
      uploadImageFromUrl: jest.fn(async () => 'image-hash-1'),
    };
    const orchestrator = new MetaCampaignOrchestrator(graphApi as any, metaImageUpload as any);
    const dto: CreateMetaCampaignDto = {
      name: 'Staging Website',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 25,
      startTime: '2026-05-02T21:30:00.000Z',
      endTime: '2026-05-09T21:30:00.000Z',
      country: 'BR',
      ageMin: 25,
      ageMax: 55,
      gender: 'ALL',
      adAccountId: 'de2c5249-3818-412e-8ee5-7af50373f784',
      message: 'Teste real controlado',
      imageUrl: 'https://example.com/staging.png',
      destinationUrl: 'https://example.com/oferta',
      headline: 'Oferta staging',
      description: 'Criacao controlada',
      cta: 'LEARN_MORE',
      placements: ['feed', 'stories'],
      initialStatus: 'PAUSED',
    };

    await orchestrator.createResources({
      adAccountExternalId: 'act_375503150479892',
      accessToken: 'meta-token',
      dto,
      pageId: '1043259782209836',
      destinationUrl: dto.destinationUrl!,
      objective: dto.objective,
      onStepCreated: async () => undefined,
    });

    const adsetPayload = graphApi.post.mock.calls[1][2] as Record<string, string>;
    const targeting = JSON.parse(String(adsetPayload.targeting)) as Record<string, any>;

    expect(targeting.targeting_automation).toEqual({ advantage_audience: 0 });
  });
});
