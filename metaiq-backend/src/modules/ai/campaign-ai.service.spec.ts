import {
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignAiService } from './campaign-ai.service';

describe('CampaignAiService', () => {
  function createService(overrides: Record<string, unknown> = {}): CampaignAiService {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          GEMINI_API_KEY: 'gemini-test-key',
          GEMINI_MODEL: 'gemini-2.5-flash',
          GEMINI_API_VERSION: 'v1beta',
          ...overrides,
        };

        return values[key];
      }),
    } as unknown as ConfigService;

    return new CampaignAiService(config);
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws when Gemini API key is missing', async () => {
    const service = createService({ GEMINI_API_KEY: '' });

    await expect(service.suggestCampaign('campanha para leads')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('normalizes a valid Gemini JSON response', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        summary: 'Resumo',
        detectedFields: ['campaignName', 'budget'],
        suggestions: {
          campaignName: 'Campanha IA',
          objective: 'OUTCOME_LEADS',
          budget: '120,50',
          budgetType: 'daily',
          country: 'br',
          region: 'São Paulo',
          city: 'São Paulo',
          ageMin: 24.4,
          ageMax: 45,
          gender: 'FEMALE',
          destinationType: 'messages',
          websiteUrl: 'https://metaiq.dev/oferta',
          message: 'Fale com nosso time',
          headline: 'Mais leads com clareza',
          description: 'Atendimento rapido',
          cta: 'Fale conosco',
          interests: 'remarketing, moda',
          utmSource: 'meta',
          utmMedium: 'cpc',
          utmCampaign: 'campanha-ia',
        },
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaign('  campanha   para leads \n\n no Brasil  ');

    expect(result).toEqual({
      summary: 'Resumo',
      detectedFields: ['campaignName', 'budget'],
      suggestions: {
        campaignName: 'Campanha IA',
        objective: 'OUTCOME_LEADS',
        budget: 120.5,
        budgetType: 'daily',
        country: 'BR',
        region: 'São Paulo',
        city: 'São Paulo',
        ageMin: 24,
        ageMax: 45,
        gender: 'FEMALE',
        destinationType: 'messages',
        websiteUrl: 'https://metaiq.dev/oferta',
        message: 'Fale com nosso time',
        headline: 'Mais leads com clareza',
        description: 'Atendimento rapido',
        cta: 'Fale conosco',
        interests: 'remarketing, moda',
        utmSource: 'meta',
        utmMedium: 'cpc',
        utmCampaign: 'campanha-ia',
      },
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
    expect(generateContent.mock.calls[0][0].contents).toContain('campanha para leads');
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe('application/json');
    expect(generateContent.mock.calls[0][0].config.responseJsonSchema).toBeDefined();
  });

  it('retries with a fallback model when the first one fails', async () => {
    const service = createService();
    const generateContent = jest
      .fn()
      .mockRejectedValueOnce(new Error('429 too many requests'))
      .mockResolvedValueOnce({
        text: JSON.stringify({
          summary: 'Fallback OK',
          detectedFields: ['objective'],
          suggestions: {
            objective: 'OUTCOME_TRAFFIC',
          },
        }),
      });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaign('trafego para landing page');

    expect(result.summary).toBe('Fallback OK');
    expect(result.suggestions.objective).toBe('OUTCOME_TRAFFIC');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash');
    expect(generateContent.mock.calls[1][0].model).toBe('gemini-2.5-flash-lite');
  });

  it('returns a friendly gateway error when all Gemini models fail', async () => {
    const service = createService();
    const generateContent = jest
      .fn()
      .mockRejectedValue(new Error('PERMISSION_DENIED: invalid api key'));

    (service as any).ai = {
      models: { generateContent },
    };

    await expect(service.suggestCampaign('teste')).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Chave Gemini inválida ou expirada. Verifique a configuração da API.',
      }),
    });
  });

  it('rejects malformed JSON returned by Gemini', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: 'nao e json',
    });

    (service as any).ai = {
      models: { generateContent },
    };

    await expect(service.suggestCampaign('teste')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects empty prompts after normalization', async () => {
    const service = createService();

    await expect(service.suggestCampaign('   \n\n   ')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('keeps region and city when Gemini provides structured location', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        summary: 'Localização detectada',
        detectedFields: ['country', 'region', 'city'],
        suggestions: {
          country: 'BR',
          region: 'São Paulo',
          city: 'São Paulo',
        },
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaign('campanha em SP capital');

    expect(result.suggestions.country).toBe('BR');
    expect(result.suggestions.region).toBe('São Paulo');
    expect(result.suggestions.city).toBe('São Paulo');
  });
});
