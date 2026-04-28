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
      strategy: 'Campanha local focada em conversas com intenção imediata e benefício claro.',
      primaryText: 'Seu pet limpo, cheiroso e bem cuidado em Curitiba. Fale com a equipe e agende.',
      headline: 'Agende banho e tosa',
      description: 'Atendimento rapido para bairros proximos.',
      cta: 'Fale conosco',
      audience: {
        gender: 'all',
        ageRange: '25-55',
        interests: ['pet shop', 'banho e tosa'],
      },
      budgetSuggestion: 80,
      risks: ['Sem pagina de prova social validada'],
      improvements: ['Revisar bairros atendidos antes de enviar'],
      reasoning: [
        'A estratégia usa o contexto local da store.',
        'O público prioriza tutores com intenção de agendar.',
      ],
      explanation: {
        strategy: 'A campanha foi montada para gerar conversas diretas no WhatsApp.',
        audience: 'O público combina tutores com intenção de cuidado recorrente e proximidade geográfica.',
        copy: 'A copy foca dor, benefício e chamada para falar com a equipe.',
        budget: 'O orçamento parte de um teste controlado para validar resposta inicial.',
      },
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

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
    expect(result.campaign.campaignName).toBe('Banho e Tosa Curitiba | WhatsApp');
    expect(result.campaign.objective).toBe('OUTCOME_LEADS');
    expect(result.campaign.budget.amount).toBe(80);
    expect(result.strategy).toContain('Campanha local');
    expect(result.audience.ageRange).toBe('25-55');
    expect(result.explanation.audience).toContain('tutores');
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.budgetSuggestion).toBe(80);
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
    expect(generateContent.mock.calls[0][0].contents).toContain('Contexto da empresa');
    expect(structuredLogger.info).toHaveBeenCalled();
  });

  it('returns AI_FAILED when Gemini returns invalid JSON', async () => {
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

    expect(result.status).toBe('AI_FAILED');
    if (result.status !== 'AI_FAILED') {
      throw new Error('Expected AI_FAILED');
    }
    expect(result.reason).toBe('invalid_response');
    expect(result.meta.usedFallback).toBe(false);
    expect(result.meta.responseValid).toBe(false);
    expect(result.debug?.validationError).toBe('parse_failed');
    expect(result.debug?.hasRawText).toBe(true);
  });

  it('turns useful non-json Gemini text into a low-confidence draft', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: 'Campanha local para atrair mensagens no WhatsApp com foco em agendamento rápido e linguagem direta para tutores de pets em Curitiba.',
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha local para pet shop com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
    expect(result.primaryText).toContain('Campanha local');
    expect(result.review.confidence).toBeLessThanOrEqual(45);
    expect(result.risks).toContain('A IA respondeu fora do formato ideal. Revise antes de publicar.');
    expect(result.meta.responseValid).toBe(false);
  });

  it('accepts valid JSON wrapped in markdown fences', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: `\`\`\`json\n${JSON.stringify(validStructuredResponse())}\n\`\`\``,
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha com json em markdown',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_SUCCESS');
  });

  it('accepts valid JSON with explanatory text before and after', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: `Segue a sugestão:\n${JSON.stringify(validStructuredResponse())}\nFim da resposta`,
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha com texto extra',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_SUCCESS');
  });

  it('normalizes common field aliases from Gemini', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: 'Campanha com aliases válidos.',
        message: 'Texto principal vindo como alias.',
        adHeadline: 'Headline alias',
        desc: 'Descrição alias',
        callToAction: 'Saiba mais',
        budget: 'R$ 50 por dia',
        audience: '25-45 anos, interesse em pet shop, banho e tosa',
        campaign: {
          title: 'Campanha Alias',
          objective: 'OUTCOME_LEADS',
        },
        review: {
          summary: 'Resumo com alias',
        },
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha com aliases',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') throw new Error('Expected AI_SUCCESS');
    expect(result.primaryText).toContain('Texto principal');
    expect(result.headline).toBe('Headline alias');
    expect(result.description).toBe('Descrição alias');
    expect(result.cta).toBe('LEARN_MORE');
    expect(result.campaign.campaignName).toBe('Campanha Alias');
    expect(result.budgetSuggestion).toBe(50);
  });

  it('normalizes audience string, portuguese CTA and budget text', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: 'Campanha local segura',
        primaryText: 'Mensagem principal clara.',
        headline: 'Headline clara',
        cta: 'Fale conosco',
        dailyBudget: 'R$50,00',
        audience: 'Mulheres 25-55 interessadas em beleza e skincare',
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha para beleza com orçamento de teste',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') throw new Error('Expected AI_SUCCESS');
    expect(result.cta).toBe('CONTACT_US');
    expect(result.budgetSuggestion).toBe(50);
    expect(result.audience.interests.length).toBeGreaterThan(0);
  });

  it('does not fail when destinationUrl is missing but the answer is otherwise useful', async () => {
    const service = createService();
    const payload = validStructuredResponse();
    delete (payload.creative as any).destinationUrl;
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(payload),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha útil sem url final',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') throw new Error('Expected AI_SUCCESS');
    expect(result.creative.destinationUrl).toBeNull();
  });

  it('returns AI_FAILED when the response is empty', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({ text: '' });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha vazia',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_FAILED');
    if (result.status !== 'AI_FAILED') throw new Error('Expected AI_FAILED');
    expect(result.reason).toBe('invalid_response');
  });

  it('monta contexto completo da store com tenant, manager e histórico quando disponível', async () => {
    const config = {
      get: jest.fn((key: string) => ({
        GEMINI_API_KEY: 'gemini-test-key',
        GEMINI_MODEL: 'gemini-2.5-flash',
        GEMINI_API_VERSION: 'v1beta',
      } as Record<string, string>)[key]),
    } as unknown as ConfigService;

    const storeRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'store-1',
        name: 'Pet Feliz',
        manager: { name: 'Ana', notes: 'Tom próximo e resposta rápida.' },
        tenant: {
          name: 'MetaIQ Pets',
          notes: 'Clínica e banho e tosa com foco em recorrência.',
          website: 'https://petfeliz.example',
          businessSegment: 'pet shop',
          accountType: 'AGENCY',
        },
      }),
    };
    const campaignRepository = {
      find: jest.fn().mockResolvedValue([
        { name: 'Campanha 1', objective: 'LEADS', dailyBudget: 70, score: 82, status: 'ACTIVE' },
        { name: 'Campanha 2', objective: 'TRAFFIC', dailyBudget: 90, score: 76, status: 'PAUSED' },
      ]),
    };
    const metricDailyRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          avgCtr: '2.31',
          avgCpa: '19.50',
          avgRoas: '3.42',
        }),
      }),
    };

    const service = new CampaignAiService(
      config,
      storeRepository as any,
      undefined,
      undefined,
      undefined,
      campaignRepository as any,
      metricDailyRepository as any,
    );

    const context = await (service as any).resolveStoreAiContext('store-1', 'Campanha para agendamentos locais');

    expect(context.companyName).toBe('Pet Feliz');
    expect(context.website).toBe('https://petfeliz.example');
    expect(context.tenantNotes).toContain('recorrência');
    expect(context.managerNotes).toContain('resposta rápida');
    expect(context.historicalContext.campaignCount).toBe(2);
    expect(context.historicalContext.metrics.ctr).toBe(2.31);
    expect(context.dataAvailability.hasHistoricalCampaigns).toBe(true);
    expect(context.dataAvailability.hasPerformanceMetrics).toBe(true);
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

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
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

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
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

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
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

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
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

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
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

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
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

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
    expect(result.analysis.summary).toContain('campanha');
    expect(result.analysis.issues.length).toBeGreaterThan(0);
    expect(result.analysis.improvements.length).toBeGreaterThan(0);
    expect(result.analysis.improvements[0].type).toBe('headline');
    expect(result.analysis.improvements[0].label).toContain('Headline');
    expect(result.analysis.confidence).toBeGreaterThanOrEqual(0);
    expect(result.analysis.confidence).toBeLessThanOrEqual(100);
    expect(result.meta.usedFallback).toBe(false);
  });

  it('returns AI_FAILED for invalid campaign analysis payloads without inventing metrics', async () => {
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

    expect(result.status).toBe('AI_FAILED');
    if (result.status !== 'AI_FAILED') {
      throw new Error('Expected AI_FAILED');
    }
    expect(result.reason).toBe('invalid_response');
    expect(result.meta.usedFallback).toBe(false);
  });
});
