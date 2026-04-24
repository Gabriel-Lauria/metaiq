import {
  GoneException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { CampaignAiController } from './campaign-ai.controller';
import { CampaignAnalysisDto, CampaignSuggestionDto } from './dto/campaign-ai.dto';
import { CampaignAiService } from './campaign-ai.service';

describe('CampaignAiService', () => {
  function createService(
    overrides: Record<string, unknown> = {},
    structuredLogger?: any,
  ): CampaignAiService {
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

    return new CampaignAiService(config, undefined, undefined, undefined, structuredLogger);
  }

  function validStructuredResponse(overrides: Record<string, unknown> = {}) {
    return {
      planner: {
        businessType: 'servico local',
        goal: 'Gerar agendamentos no WhatsApp',
        funnelStage: 'bottom',
        offer: 'Banho e tosa com agendamento',
        audienceIntent: 'Tutores com intencao de agendar nos proximos dias.',
        missingInputs: ['Faixa de bairros prioritarios', 'Oferta promocional valida'],
        assumptions: ['A loja atende Curitiba e arredores.'],
      },
      campaign: {
        campaignName: 'Banho e Tosa Curitiba | WhatsApp',
        objective: 'OUTCOME_LEADS',
        buyingType: 'AUCTION',
        status: 'PAUSED',
        budget: {
          type: 'daily',
          amount: 80,
          currency: 'BRL',
        },
      },
      adSet: {
        name: 'Publico tutores Curitiba',
        optimizationGoal: 'LEADS',
        billingEvent: 'IMPRESSIONS',
        targeting: {
          country: 'BR',
          state: 'Parana',
          stateCode: 'PR',
          city: 'Curitiba',
          ageMin: 25,
          ageMax: 55,
          gender: 'all',
          interests: ['pet shop', 'banho e tosa'],
          excludedInterests: [],
          placements: ['feed', 'stories'],
        },
      },
      creative: {
        name: 'Criativo 1',
        primaryText: 'Seu pet limpo, cheiroso e bem cuidado em Curitiba. Fale com a equipe e agende.',
        headline: 'Agende banho e tosa',
        description: 'Atendimento rapido para bairros proximos.',
        cta: 'Fale conosco',
        imageSuggestion: 'Antes e depois com autorizacao do tutor.',
        destinationUrl: 'https://metaiq.dev/agendar',
      },
      review: {
        summary: 'Campanha local focada em conversas com intencao imediata.',
        strengths: ['Objetivo aderente a servico local', 'Mensagem clara para agendamento'],
        risks: ['Sem pagina de prova social validada'],
        recommendations: ['Revisar bairros atendidos antes de enviar'],
        confidence: 74,
      },
      validation: {
        isReadyToPublish: true,
        qualityScore: 78,
        blockingIssues: [],
        warnings: ['O CTA pode ficar mais especifico para o objetivo.'],
        recommendations: ['Adicione prova social antes do envio.'],
      },
      ...overrides,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid storeId format on the contextual AI DTO', async () => {
    const dto = new CampaignSuggestionDto();
    dto.prompt = 'Campanha de leads para loja local';
    dto.storeId = 'store-sem-uuid';

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'storeId')).toBe(true);
  });

  it('accepts UUID storeId on the contextual AI DTO', async () => {
    const dto = new CampaignSuggestionDto();
    dto.prompt = 'Campanha de leads para loja local';
    dto.storeId = '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001';
    dto.goal = 'vender pelo WhatsApp';
    dto.funnelStage = 'bottom';
    dto.budget = 120;
    dto.durationDays = 7;
    dto.primaryOffer = 'consulta inicial';
    dto.destinationType = 'whatsapp';
    dto.region = 'Curitiba';
    dto.extraContext = 'Atendimento consultivo e operação local.';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts structured campaign analysis DTO with UUID storeId', async () => {
    const dto = new CampaignAnalysisDto();
    dto.storeId = '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001';
    dto.campaign = { name: 'Campanha teste', objective: 'OUTCOME_LEADS' };
    dto.creative = { headline: 'Agende agora' };
    dto.targeting = { country: 'BR' };
    dto.budget = { value: 80 };
    dto.destinationUrl = 'https://metaiq.dev';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects invalid optional commercial briefing values', async () => {
    const dto = new CampaignSuggestionDto();
    dto.prompt = 'Campanha de leads para loja local';
    dto.storeId = '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001';
    dto.funnelStage = 'historico' as any;
    dto.destinationType = 'outdoor' as any;
    dto.durationDays = 999;

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['funnelStage', 'destinationType', 'durationDays']),
    );
  });

  it('disables the legacy prompt-only endpoint', async () => {
    const controller = new CampaignAiController({} as CampaignAiService);

    await expect(controller.suggest()).rejects.toBeInstanceOf(GoneException);
  });

  it('throws when Gemini API key is missing on the legacy endpoint', async () => {
    const service = createService({ GEMINI_API_KEY: '' });

    await expect(service.suggestCampaign('campanha para leads')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('returns a valid structured response from Gemini', async () => {
    const structuredLogger = {
      info: jest.fn(),
      metric: jest.fn(),
    };
    const service = createService({}, structuredLogger);
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(validStructuredResponse()),
    });

    (service as any).ai = {
      models: { generateContent },
    };
    (service as any).resolveStoreAiContext = jest.fn().mockResolvedValue({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      storeName: 'MetaIQ Pets',
      companyName: 'MetaIQ Pets',
      segment: 'pet shop',
      description: 'Pet shop local com foco em banho e tosa agendado.',
      targetAudience: 'Tutores de pets em Curitiba e regiao.',
      businessType: 'servico local',
      managerName: 'Ana',
      tenantName: 'MetaIQ',
      contextSources: ['briefing', 'store_profile'],
      storeProfile: {
        name: 'MetaIQ Pets',
        segment: 'pet shop',
        businessType: 'servico local',
        city: 'Curitiba',
        region: 'PR',
        salesModel: 'local',
        mainOffer: 'Banho e tosa com agendamento',
        targetAudienceBase: 'Tutores de pets em Curitiba e regiao.',
        differentiators: ['Atendimento rapido', 'Equipe especializada'],
        notesSummary: 'Atende bairros proximos e prioriza agendamento via WhatsApp.',
      },
      campaignIntent: {
        goal: 'gerar agendamentos',
        funnelStage: 'bottom',
        channelPreference: 'whatsapp',
        budgetRange: 'R$ 80 por dia',
        durationDays: 7,
        destinationType: 'messages',
        primaryOffer: 'Banho e tosa com agendamento',
        region: 'Curitiba',
        extraContext: 'Campanha local para conversas no WhatsApp.',
      },
      dataAvailability: {
        hasHistoricalCampaigns: false,
        hasPerformanceMetrics: false,
        hasConnectedMetaAccount: true,
        hasConnectedPage: true,
      },
    });

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de banho e tosa em Curitiba com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      goal: 'gerar agendamentos',
      budget: 80,
    });

    expect(result.campaign.campaignName).toBe('Banho e Tosa Curitiba | WhatsApp');
    expect(result.campaign.objective).toBe('OUTCOME_LEADS');
    expect(result.campaign.budget.amount).toBe(80);
    expect(result.adSet.targeting.country).toBe('BR');
    expect(result.adSet.targeting.state).toBe('Parana');
    expect(result.adSet.targeting.stateCode).toBe('PR');
    expect(result.adSet.targeting.city).toBe('Curitiba');
    expect(result.creative.destinationUrl).toBe('https://metaiq.dev/agendar');
    expect(result.review.confidence).toBe(74);
    expect(result.validation.qualityScore).toBe(78);
    expect(result.validation.isReadyToPublish).toBe(true);
    expect(result.meta.usedFallback).toBe(false);
    expect(result.meta.responseValid).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe('application/json');
    expect(generateContent.mock.calls[0][0].contents).toContain('planner');
    expect(structuredLogger.info).toHaveBeenCalled();
  });

  it('returns a structured fallback when Gemini returns invalid JSON', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: 'nao e json',
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha local para loja de bairro',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.meta.usedFallback).toBe(true);
    expect(result.meta.responseValid).toBe(false);
    expect(result.review.confidence).toBeGreaterThanOrEqual(0);
    expect(result.review.confidence).toBeLessThanOrEqual(100);
    expect(result.planner.missingInputs.length).toBeGreaterThan(0);
    expect(result.validation.isReadyToPublish).toBe(false);
    expect(result.validation.blockingIssues.length).toBeGreaterThan(0);
  });

  it('sanitizes non-https destinationUrl and clamps confidence', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(validStructuredResponse({
        creative: {
          ...validStructuredResponse().creative,
          destinationUrl: 'http://metaiq.dev/inseguro',
        },
        review: {
          ...validStructuredResponse().review,
          confidence: 999,
        },
      })),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha com url insegura',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.creative.destinationUrl).toBeNull();
    expect(result.review.confidence).toBe(100);
    expect(result.validation.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.validation.qualityScore).toBeLessThanOrEqual(100);
  });

  it('keeps targeting fields pending when the model does not know them', async () => {
    const service = createService();
    const base = validStructuredResponse();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        ...base,
        campaign: {
          ...base.campaign,
          budget: {
            ...base.campaign.budget,
            type: null,
            amount: null,
          },
        },
        adSet: {
          ...base.adSet,
          targeting: {
            ...base.adSet.targeting,
            country: null,
            state: null,
            stateCode: null,
            city: null,
            ageMin: null,
            ageMax: null,
            placements: [],
          },
        },
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha inicial sem localização definida nem orçamento fechado',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.campaign.budget.type).toBeNull();
    expect(result.campaign.budget.amount).toBeNull();
    expect(result.adSet.targeting.country).toBeNull();
    expect(result.adSet.targeting.state).toBeNull();
    expect(result.adSet.targeting.stateCode).toBeNull();
    expect(result.adSet.targeting.city).toBeNull();
    expect(result.adSet.targeting.ageMin).toBeNull();
    expect(result.adSet.targeting.ageMax).toBeNull();
    expect(result.adSet.targeting.placements).toEqual([]);
  });

  it('keeps city without inventing uf when the model cannot confirm the brazilian state', async () => {
    const service = createService();
    const base = validStructuredResponse();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        ...base,
        adSet: {
          ...base.adSet,
          targeting: {
            ...base.adSet.targeting,
            state: null,
            stateCode: null,
            city: 'Cidade Desconhecida',
          },
        },
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha para Cidade Desconhecida no Brasil',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.adSet.targeting.city).toBe('Cidade Desconhecida');
    expect(result.adSet.targeting.state).toBeNull();
    expect(result.adSet.targeting.stateCode).toBeNull();
  });

  it('creates fallback validation when the model omits the validation section', async () => {
    const service = createService();
    const payload = validStructuredResponse();
    delete (payload as any).validation;
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(payload),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha com estrutura mas sem validacao no retorno do modelo',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.validation).toBeDefined();
    expect(result.validation.isReadyToPublish).toBe(false);
    expect(result.validation.blockingIssues.length).toBeGreaterThan(0);
    expect(result.validation.recommendations.length).toBeGreaterThan(0);
  });

  it('forces isReadyToPublish to false when there are blocking issues', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(validStructuredResponse({
        validation: {
          isReadyToPublish: true,
          qualityScore: 91,
          blockingIssues: ['A campanha precisa de uma destinationUrl válida em https.'],
          warnings: [],
          recommendations: ['Revise manualmente antes de enviar.'],
        },
      })),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha com problema crítico de validação',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.validation.blockingIssues.length).toBeGreaterThan(0);
    expect(result.validation.isReadyToPublish).toBe(false);
    expect(result.validation.qualityScore).toBeLessThanOrEqual(45);
  });

  it('rejects prompt or storeId missing for structured suggestions', async () => {
    const service = createService();

    await expect(service.suggestCampaignFormFields({
      prompt: '   ',
      storeId: '',
    } as any)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('does not invent performance metrics in the structured contract', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(validStructuredResponse()),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha sem historico real',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect((result as any).metrics).toBeUndefined();
    expect((result as any).roas).toBeUndefined();
    expect(result.review.risks.join(' ')).not.toMatch(/CTR|CPA|ROAS/i);
  });

  it('returns a valid structured campaign copilot analysis', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        analysis: {
          summary: 'A campanha está coerente, mas ainda pede refinamento de público e CTA.',
          strengths: ['Objetivo e URL final estão consistentes.'],
          issues: ['Seu público está muito amplo para o orçamento definido.'],
          improvements: [{
            id: 'headline-direct',
            type: 'headline',
            label: 'Headline pode ser mais direta',
            description: 'Use uma headline mais orientada ao próximo passo.',
            suggestedValue: 'Agende sua consulta hoje mesmo',
            confidence: 78,
          }],
          confidence: 78,
        },
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };
    (service as any).resolveStoreAiContext = jest.fn().mockResolvedValue({
      companyName: 'MetaIQ Pets',
      segment: 'pet shop',
      businessType: 'servico local',
      targetAudience: 'Tutores de pets',
      dataAvailability: {
        hasHistoricalCampaigns: false,
        hasPerformanceMetrics: false,
        hasConnectedMetaAccount: true,
        hasConnectedPage: true,
      },
    });

    const result = await service.analyzeCampaign({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      campaign: { name: 'Campanha', objective: 'OUTCOME_LEADS' },
      creative: { message: 'Saiba mais sobre nosso servico.', headline: 'Banho e tosa' },
      targeting: { country: 'BR', autoAudience: true, interests: [] },
      budget: { value: 50 },
      location: { country: 'BR', city: 'Curitiba', state: 'PR' },
      cta: 'LEARN_MORE',
      destinationUrl: 'https://metaiq.dev/agendar',
    });

    expect(result.analysis.summary).toContain('campanha');
    expect(result.analysis.issues.length).toBeGreaterThan(0);
    expect(result.analysis.improvements.length).toBeGreaterThan(0);
    expect(result.analysis.improvements[0].type).toBe('headline');
    expect(result.analysis.improvements[0].label).toContain('Headline');
    expect(result.analysis.confidence).toBeGreaterThanOrEqual(0);
    expect(result.analysis.confidence).toBeLessThanOrEqual(100);
    expect(result.meta.usedFallback).toBe(false);
  });

  it('falls back to heuristic campaign analysis without inventing metrics', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: '{"analysis":{"summary":"incompleto"',
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.analyzeCampaign({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      campaign: { name: 'Campanha local', objective: 'OUTCOME_LEADS' },
      creative: { message: 'Conheca nossa solucao.', headline: '' },
      targeting: { country: 'BR', autoAudience: true, interests: [], ageMin: 18, ageMax: 65 },
      budget: { value: 30 },
      location: { country: 'BR', city: 'Curitiba' },
      cta: 'LEARN_MORE',
      destinationUrl: 'http://metaiq.dev/inseguro',
    });

    expect(result.meta.usedFallback).toBe(true);
    expect(result.analysis.issues.join(' ')).not.toMatch(/CTR|ROAS|CPA/i);
    expect(result.analysis.confidence).toBeGreaterThanOrEqual(0);
    expect(result.analysis.confidence).toBeLessThanOrEqual(100);
    expect(result.analysis.issues.length).toBeGreaterThan(0);
    expect(result.analysis.improvements.every((item) => item.confidence >= 0 && item.confidence <= 100)).toBe(true);
    expect(result.analysis.improvements.every((item) => !JSON.stringify(item).match(/CTR|ROAS|CPA/i))).toBe(true);
  });
});
