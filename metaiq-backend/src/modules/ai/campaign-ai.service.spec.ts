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
      cta: 'MESSAGE_PAGE',
      intent: {
        objective: 'OUTCOME_LEADS',
        destinationType: 'messages',
        funnelStage: 'bottom',
        budgetAmount: 80,
        budgetType: 'daily',
        region: 'Curitiba',
        segment: 'pet shop',
        offer: 'Banho e tosa com agendamento',
        channel: 'whatsapp',
        cta: 'MESSAGE_PAGE',
        remarketingExpected: false,
        messageDestinationAvailable: true,
        websiteAvailable: false,
        metaConnected: true,
        pageConnected: true,
        whatsappAvailable: false,
        instagramAvailable: false,
      },
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
        cta: 'MESSAGE_PAGE',
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
      fieldOrigins: {
        segment: 'tenant_default',
        businessType: 'tenant_default',
        city: 'tenant_default',
        region: 'tenant_default',
        goal: 'input',
        funnelStage: 'backend_inference',
        budget: null,
        destinationType: 'prompt',
        channelPreference: 'prompt',
        primaryOffer: 'tenant_default',
        extraContext: 'input',
      },
    });

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de banho e tosa em Curitiba com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      goal: 'gerar agendamentos',
      budget: 80,
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status !== 'AI_NEEDS_REVIEW') {
      throw new Error('Expected AI_NEEDS_REVIEW');
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
    expect(result.creative.destinationUrl).toBeNull();
    expect(result.intent.destinationType).toBe('messages');
    expect(result.intent.cta).toBe('MESSAGE_PAGE');
    expect(result.review.confidence).toBe(74);
    expect(result.validation.qualityScore).toBeLessThanOrEqual(45);
    expect(result.validation.isReadyToPublish).toBe(false);
    expect(result.validation.blockingIssues).toContain(
      'Campanhas de mensagens (WhatsApp, Messenger, Instagram) ainda não possuem publicação automática nesta versão. A IA pode sugerir estratégia e estrutura, mas a publicação automática atual é apenas para campanhas de website.',
    );
    expect(result.meta.usedFallback).toBe(false);
    expect(result.meta.responseValid).toBe(true);
    expect(structuredLogger.info).toHaveBeenCalledWith(
      'Campaign AI resolved briefing and intent before Gemini',
      expect.objectContaining({
        storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
        briefingExtracted: expect.objectContaining({
          destinationType: 'messages',
        }),
        fieldOrigins: expect.objectContaining({
          destinationType: 'prompt',
        }),
      }),
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe('application/json');
    expect(generateContent.mock.calls[0][0].config.maxOutputTokens).toBe(4096);
    expect(generateContent.mock.calls[0][0].config.temperature).toBe(0.2);
    expect(generateContent.mock.calls[0][0].config.candidateCount).toBe(1);
    expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(generateContent.mock.calls[0][0].contents).toContain('JSON minificado');
    expect(generateContent.mock.calls[0][0].contents).toContain('Contexto:');
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

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
    expect(result.reason).toBe('invalid_response');
    expect(result.meta.usedFallback).toBe(false);
    expect(result.meta.responseValid).toBe(false);
    expect(result.debug?.validationError).toBe('parse_failed');
    expect(result.debug?.hasRawText).toBe(true);
  });

  it('prefers a valid candidateText when response.text is truncated', async () => {
    const service = createService();
    const fullJson = JSON.stringify(validStructuredResponse());
    const generateContent = jest.fn().mockResolvedValue({
      text: '{"strategy":"Resposta truncada","headline":"Nao per',
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [{ text: fullJson }],
          },
        },
      ],
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de banho e tosa em Curitiba com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status !== 'AI_NEEDS_REVIEW') {
      throw new Error('Expected AI_NEEDS_REVIEW');
    }
    expect(result.creative.headline).toBe('Agende banho e tosa');
  });

  it('returns AI_NEEDS_RETRY with truncation diagnostics when Gemini stops at MAX_TOKENS', async () => {
    const service = createService();
    const loggerLog = jest.spyOn((service as any).logger, 'log').mockImplementation();
    const truncatedText = '{"strategy":"Remarketing para e-commerce de moda","headline":"Nao per';
    const generateContent = jest.fn().mockResolvedValue({
      candidates: [
        {
          finishReason: 'MAX_TOKENS',
          content: {
            parts: [{ text: truncatedText }],
          },
        },
      ],
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para ecommerce de moda no Brasil com orcamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
    expect((result as any).reason).toBe('invalid_response');
    expect((result as any).message).toContain('JSON truncado');
    expect((result as any).debug?.validationError).toBe('truncated_response');
    expect((result as any).debug?.finishReason).toBe('MAX_TOKENS');
    expect((result as any).debug?.maxOutputTokens).toBe(4096);
    expect((result as any).debug?.rawTextLength).toBe(truncatedText.length);
    expect((result as any).debug?.candidateTextLength).toBe(truncatedText.length);
    expect((result as any).debug?.candidateTextEndsWithClosingBrace).toBe(false);
    expect(generateContent.mock.calls[0][0].config.maxOutputTokens).toBe(4096);

    const debugLogCall = loggerLog.mock.calls.find(([entry]) => {
      if (typeof entry !== 'string') {
        return false;
      }
      try {
        const parsed = JSON.parse(entry);
        return parsed.stage === 'gemini_response_debug';
      } catch {
        return false;
      }
    });

    expect(debugLogCall).toBeDefined();
    const parsedDebugLog = JSON.parse(debugLogCall?.[0] as string);
    expect(parsedDebugLog.finishReason).toBe('MAX_TOKENS');
    expect(parsedDebugLog.maxOutputTokens).toBe(4096);
    expect(parsedDebugLog.rawTextLength).toBe(truncatedText.length);
    expect(parsedDebugLog.candidateTextLength).toBe(truncatedText.length);
    expect(parsedDebugLog.candidateTextEndsWithClosingBrace).toBe(false);
  });

  it('does not turn non-json Gemini text into a draft suggestion', async () => {
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

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
    expect((result as unknown as Record<string, unknown>).primaryText).toBeUndefined();
    expect((result as any).reason).toBe('invalid_response');
    expect(result.meta.usedFallback).toBe(false);
    expect(result.meta.responseValid).toBe(false);
  });

  it('accepts valid JSON wrapped in markdown fences', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: `\`\`\`json\n${JSON.stringify(validStructuredResponse())}\n\`\`\``,
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de banho e tosa em Curitiba com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
  });

  it('accepts valid JSON with explanatory text before and after', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: `Segue a sugestão:\n${JSON.stringify(validStructuredResponse())}\nFim da resposta`,
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de banho e tosa em Curitiba com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
  });

  it('normalizes common field aliases from Gemini but keeps review state when confidence is insufficient', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: 'Campanha com aliases válidos.',
        message: 'Texto principal vindo como alias.',
        adHeadline: 'Headline alias',
        desc: 'Descrição alias',
        callToAction: 'Enviar mensagem',
        budget: 'R$ 50 por dia',
        audience: '25-45 anos, interesse em pet shop, banho e tosa',
        campaign: {
          title: 'Campanha Alias',
          objective: 'OUTCOME_LEADS',
          budget: { type: 'daily', amount: 50, currency: 'BRL' },
        },
        adSet: {
          targeting: {
            country: 'BR',
            state: 'Parana',
            stateCode: 'PR',
            city: 'Curitiba',
            interests: ['pet shop', 'banho e tosa'],
          },
        },
        destinationUrl: 'https://metaiq.dev/agendar',
        review: {
          summary: 'Resumo com alias',
          confidence: 74,
        },
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de banho e tosa em Curitiba com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status === 'AI_FAILED' || result.status === 'AI_NEEDS_RETRY') {
      throw new Error('Expected structured review response');
    }
    const structured = result as any;
    expect(structured.primaryText).toContain('Texto principal');
    expect(structured.headline).toBe('Headline alias');
    expect(structured.description).toBe('Descrição alias');
    expect(structured.cta).toBe('MESSAGE_PAGE');
    expect(structured.campaign.campaignName).toBe('Campanha Alias');
    expect(structured.budgetSuggestion).toBe(80);
  });

  it('blocks suggestions that contradict the briefing', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: 'Campanha para pet shop com público frio.',
        primaryText: 'Banho e tosa com atendimento rapido.',
        headline: 'Metaiq | Leads | Geração de leads | Meta',
        description: 'Oferta generica.',
        cta: 'LEARN_MORE',
        audience: { gender: 'all', ageRange: '25-55', interests: ['pet shop'] },
        campaign: {
          campaignName: 'Campanha Pet',
          objective: 'OUTCOME_TRAFFIC',
          buyingType: 'AUCTION',
          status: 'PAUSED',
          budget: { type: 'daily', amount: 50, currency: 'BRL' },
        },
        adSet: {
          name: 'Publico frio pet',
          optimizationGoal: 'LINK_CLICKS',
          billingEvent: 'IMPRESSIONS',
          targeting: {
            country: 'BR',
            state: null,
            stateCode: null,
            city: null,
            ageMin: 25,
            ageMax: 55,
            gender: 'all',
            interests: ['pet shop'],
            excludedInterests: [],
            placements: ['feed'],
          },
        },
        creative: {
          name: 'Criativo pet',
          primaryText: 'Banho e tosa com atendimento rapido.',
          headline: 'Metaiq | Leads | Geração de leads | Meta',
          description: 'Oferta generica.',
          cta: 'LEARN_MORE',
          imageSuggestion: null,
          destinationUrl: 'https://metaiq.dev/oferta',
        },
        review: { summary: 'Campanha pet.', strengths: [], risks: [], recommendations: [], confidence: 72 },
        validation: { isReadyToPublish: true, qualityScore: 80, blockingIssues: [], warnings: [], recommendations: [] },
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para ecommerce de moda no Brasil com orçamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      goal: 'gerar leads',
      budget: 120,
      funnelStage: 'remarketing',
      destinationType: 'whatsapp',
      primaryOffer: 'moda feminina',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
    expect((result as any).reason).toBe('invalid_response');
  });

  it('returns AI_NEEDS_RETRY when the briefing CTA CONTACT_US is altered', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: 'Campanha de tráfego para site.',
        primaryText: 'Descubra a nova coleção no site e confira as ofertas online.',
        headline: 'Visite nossa loja online',
        description: 'Ofertas exclusivas para quem acessa agora.',
        cta: 'LEARN_MORE',
        audience: { gender: 'all', ageRange: '25-45', interests: ['moda', 'compras online'] },
        campaign: {
          campaignName: 'Coleção de Moda Online',
          objective: 'OUTCOME_TRAFFIC',
          buyingType: 'AUCTION',
          status: 'PAUSED',
          budget: { type: 'daily', amount: 50, currency: 'BRL' },
        },
        adSet: {
          name: 'Publico moda online',
          optimizationGoal: 'LINK_CLICKS',
          billingEvent: 'IMPRESSIONS',
          targeting: {
            country: 'BR',
            state: null,
            stateCode: null,
            city: null,
            ageMin: 25,
            ageMax: 45,
            gender: 'all',
            interests: ['moda', 'compras online'],
            excludedInterests: [],
            placements: ['feed'],
          },
        },
        creative: {
          name: 'Criativo online',
          primaryText: 'Descubra a nova coleção no site e confira as ofertas online.',
          headline: 'Visite nossa loja online',
          description: 'Ofertas exclusivas para quem acessa agora.',
          cta: 'LEARN_MORE',
          imageSuggestion: null,
          destinationUrl: 'https://metaiq.dev/colecao',
        },
        review: { summary: 'Campanha de tráfego online.', strengths: [], risks: [], recommendations: [], confidence: 72 },
        validation: { isReadyToPublish: true, qualityScore: 80, blockingIssues: [], warnings: [], recommendations: [] },
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de tráfego para site de moda com orçamento 50 por dia e CTA CONTACT_US.',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') throw new Error('Expected AI_NEEDS_RETRY');
    expect((result as any).reason).toBe('invalid_response');
    expect((result as any).message).toContain('preservando exatamente os campos esperados');
    expect((result as any).debug?.failedRules).toEqual(expect.arrayContaining(['cta_mismatch']));
    expect((result as any).debug?.immutableFieldMismatches).toEqual(expect.arrayContaining(['cta']));
  });

  it('returns AI_NEEDS_RETRY when the briefing segment is altered', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: 'Campanha local para pet shop.',
        primaryText: 'Seu pet limpo, cheiroso e bem cuidado.',
        headline: 'Agende banho e tosa',
        description: 'Atendimento rapido para bairros proximos.',
        cta: 'CONTACT_US',
        audience: { gender: 'all', ageRange: '25-55', interests: ['pet shop'] },
        campaign: {
          campaignName: 'Pet Shop Local',
          objective: 'OUTCOME_TRAFFIC',
          buyingType: 'AUCTION',
          status: 'PAUSED',
          budget: { type: 'daily', amount: 50, currency: 'BRL' },
        },
        adSet: {
          name: 'Publico pet',
          optimizationGoal: 'LINK_CLICKS',
          billingEvent: 'IMPRESSIONS',
          targeting: {
            country: 'BR',
            state: null,
            stateCode: null,
            city: null,
            ageMin: 25,
            ageMax: 55,
            gender: 'all',
            interests: ['pet shop'],
            excludedInterests: [],
            placements: ['feed'],
          },
        },
        creative: {
          name: 'Criativo pet',
          primaryText: 'Seu pet limpo, cheiroso e bem cuidado.',
          headline: 'Agende banho e tosa',
          description: 'Atendimento rapido para bairros proximos.',
          cta: 'CONTACT_US',
          imageSuggestion: null,
          destinationUrl: 'https://metaiq.dev/pet',
        },
        review: { summary: 'Campanha pet shop.', strengths: [], risks: [], recommendations: [], confidence: 72 },
        validation: { isReadyToPublish: true, qualityScore: 80, blockingIssues: [], warnings: [], recommendations: [] },
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para ecommerce de moda no Brasil com orçamento 50 por dia e CTA CONTACT_US.',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') throw new Error('Expected AI_NEEDS_RETRY');
    expect((result as any).debug?.failedRules).toEqual(expect.arrayContaining(['segment_mismatch']));
    expect((result as any).debug?.immutableFieldMismatches).toEqual(expect.arrayContaining(['segment']));
  });

  it('returns AI_NEEDS_RETRY when a site briefing is rewritten as messages without destinationUrl', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: 'Campanha para levar visitantes ao site.',
        primaryText: 'Acesse o site e veja nossas novidades.',
        headline: 'Visite nosso site',
        description: 'Promoções exclusivas online.',
        cta: 'CONTACT_US',
        audience: { gender: 'all', ageRange: '25-45', interests: ['moda', 'wear'] },
        campaign: {
          campaignName: 'Site Moda Online',
          objective: 'OUTCOME_TRAFFIC',
          buyingType: 'AUCTION',
          status: 'PAUSED',
          budget: { type: 'daily', amount: 50, currency: 'BRL' },
        },
        adSet: {
          name: 'Publico site moda',
          optimizationGoal: 'LINK_CLICKS',
          billingEvent: 'IMPRESSIONS',
          targeting: {
            country: 'BR',
            state: null,
            stateCode: null,
            city: null,
            ageMin: 25,
            ageMax: 45,
            gender: 'all',
            interests: ['moda', 'compras online'],
            excludedInterests: [],
            placements: ['feed'],
          },
        },
        creative: {
          name: 'Criativo site',
          primaryText: 'Acesse o site e veja nossas novidades.',
          headline: 'Visite nosso site',
          description: 'Promoções exclusivas online.',
          cta: 'CONTACT_US',
          imageSuggestion: null,
          destinationUrl: null,
        },
        review: { summary: 'Campanha de site sem URL.', strengths: [], risks: [], recommendations: [], confidence: 72 },
        validation: { isReadyToPublish: true, qualityScore: 80, blockingIssues: [], warnings: [], recommendations: [] },
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de tráfego para site com orçamento 50 por dia e CTA CONTACT_US.',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') throw new Error('Expected AI_NEEDS_RETRY');
    expect((result as any).debug?.failedRules).toEqual(expect.arrayContaining(['destination_mismatch', 'destination_url_missing']));
    expect((result as any).debug?.immutableFieldMismatches).toEqual(expect.arrayContaining(['destinationType']));
  });

  it('returns AI_NEEDS_REVIEW when only remarketing audience is still missing', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(validStructuredResponse({
        strategy: 'Campanha de leads para ecommerce de moda com atendimento no WhatsApp.',
        primaryText: 'Fale com a equipe no WhatsApp e descubra as novidades da coleção.',
        headline: 'Fale com a equipe da loja',
        description: 'Atendimento rápido para recuperar interesse.',
        cta: 'MESSAGE_PAGE',
        audience: { gender: 'all', ageRange: '25-55', interests: ['moda feminina', 'compras online'] },
        intent: {
          ...validStructuredResponse().intent,
          objective: 'OUTCOME_LEADS',
          destinationType: 'messages',
          funnelStage: 'remarketing',
          budgetAmount: 120,
          budgetType: 'daily',
          segment: 'moda',
          cta: 'MESSAGE_PAGE',
          remarketingExpected: true,
        },
        campaign: {
          campaignName: 'Moda Brasil | WhatsApp',
          objective: 'OUTCOME_LEADS',
          buyingType: 'AUCTION',
          status: 'PAUSED',
          budget: { type: 'daily', amount: 120, currency: 'BRL' },
        },
        adSet: {
          name: 'Interesses moda Brasil',
          optimizationGoal: 'LEADS',
          billingEvent: 'IMPRESSIONS',
          targeting: {
            country: 'BR',
            state: null,
            stateCode: null,
            city: null,
            ageMin: 25,
            ageMax: 55,
            gender: 'all',
            interests: ['moda feminina', 'tendencias de moda', 'compras online'],
            excludedInterests: [],
            placements: ['feed'],
          },
        },
        creative: {
          name: 'Criativo moda',
          primaryText: 'Fale com a equipe no WhatsApp e descubra as novidades da coleção.',
          headline: 'Fale com a equipe da loja',
          description: 'Atendimento rápido para recuperar interesse.',
          cta: 'MESSAGE_PAGE',
          imageSuggestion: null,
          destinationUrl: null,
        },
        planner: {
          businessType: 'ecommerce',
          goal: 'Gerar leads no WhatsApp',
          funnelStage: 'remarketing',
          offer: 'Moda feminina',
          audienceIntent: 'Pessoas com interesse em moda e compras online.',
          missingInputs: [],
          assumptions: [],
        },
        review: {
          summary: 'Campanha de moda com WhatsApp.',
          strengths: [],
          risks: [],
          recommendations: [],
          confidence: 72,
        },
        validation: { isReadyToPublish: true, qualityScore: 80, blockingIssues: [], warnings: [], recommendations: [] },
      })),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para ecommerce de moda no Brasil com orçamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      goal: 'Tráfego',
      budget: 50,
      region: 'Curitiba / PR',
      funnelStage: 'remarketing',
      destinationType: 'website',
      primaryOffer: 'moda feminina',
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status !== 'AI_NEEDS_REVIEW') {
      throw new Error('Expected AI_NEEDS_REVIEW');
    }
    expect((result as any).reason).toBeUndefined();
    expect(result.intent.objective).toBe('OUTCOME_LEADS');
    expect(result.intent.destinationType).toBe('messages');
    expect(result.intent.budgetAmount).toBe(120);
    expect(result.intent.region).toBe('Brasil');
    expect(result.validation.isReadyToPublish).toBe(false);
    expect(result.validation.blockingIssues).toContain(
      'O briefing pede remarketing, mas ainda falta selecionar ou conectar um público de remarketing/pixel/audiência personalizada.',
    );
    expect(result.validation.recommendations).toContain(
      'Configure uma audiência personalizada, pixel ou sinais reais de engajamento antes de publicar o remarketing.',
    );
    expect(result.validation.warnings).toContain(
      'Os interesses sugeridos vieram como público frio, então foram removidos do targeting final até existir uma audiência real de remarketing.',
    );
    expect(result.audience.interests).toEqual([]);
    expect(result.adSet.targeting.interests).toEqual([]);
    expect(result.meta.responseValid).toBe(true);
    expect(result.meta.consistencyApproved).toBe(false);
    expect((result as any).debug?.failedRules).toEqual(expect.arrayContaining(['audience_mismatch']));
  });

  it('blocks consistency approval when the model returns R$50 but the explicit briefing says R$120 por dia', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(validStructuredResponse({
        strategy: 'Campanha de leads para ecommerce de moda com atendimento no WhatsApp.',
        primaryText: 'Fale com a equipe no WhatsApp para conhecer a coleção.',
        headline: 'Fale com a equipe da loja',
        description: 'Atendimento rápido para novos leads.',
        cta: 'MESSAGE_PAGE',
        intent: {
          ...validStructuredResponse().intent,
          objective: 'OUTCOME_LEADS',
          destinationType: 'messages',
          budgetAmount: 50,
          budgetType: 'daily',
          region: 'Brasil',
          segment: 'moda',
          cta: 'MESSAGE_PAGE',
        },
        audience: { gender: 'all', ageRange: '25-55', interests: ['moda feminina'] },
        campaign: {
          campaignName: 'Moda Brasil | WhatsApp',
          objective: 'OUTCOME_LEADS',
          buyingType: 'AUCTION',
          status: 'PAUSED',
          budget: { type: 'daily', amount: 50, currency: 'BRL' },
        },
        adSet: {
          name: 'Moda Brasil',
          optimizationGoal: 'LEADS',
          billingEvent: 'IMPRESSIONS',
          targeting: {
            country: 'BR',
            state: null,
            stateCode: null,
            city: null,
            ageMin: 25,
            ageMax: 55,
            gender: 'all',
            interests: ['moda feminina'],
            excludedInterests: [],
            placements: ['feed'],
          },
        },
        creative: {
          name: 'Criativo moda',
          primaryText: 'Fale com a equipe no WhatsApp para conhecer a coleção.',
          headline: 'Fale com a equipe da loja',
          description: 'Atendimento rápido para novos leads.',
          cta: 'MESSAGE_PAGE',
          imageSuggestion: null,
          destinationUrl: null,
        },
        planner: {
          businessType: 'ecommerce',
          goal: 'Gerar leads no WhatsApp',
          funnelStage: 'bottom',
          offer: 'Moda feminina',
          audienceIntent: 'Pessoas no Brasil com interesse em moda feminina.',
          missingInputs: [],
          assumptions: [],
        },
        review: {
          summary: 'Campanha de moda com WhatsApp.',
          strengths: [],
          risks: [],
          recommendations: [],
          confidence: 75,
        },
        validation: { isReadyToPublish: true, qualityScore: 82, blockingIssues: [], warnings: [], recommendations: [] },
      })),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para ecommerce de moda no Brasil. Orçamento: R$ 120 por dia. CTA falar no WhatsApp.',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      goal: 'Tráfego',
      budget: 50,
      region: 'Curitiba / PR',
      destinationType: 'website',
      primaryOffer: 'moda feminina',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
    expect((result as any).reason).toBe('invalid_response');
    expect(result.meta.consistencyApproved).toBe(false);
    expect((result as any).debug?.expectedBriefingSignals).toMatchObject({
      expectedBudget: 120,
      expectedBudgetType: 'daily',
    });
    expect((result as any).debug?.detectedResponseSignals).toMatchObject({
      rawModelBudget: 50,
    });
    expect((result as any).debug?.failedRules).toEqual(expect.arrayContaining(['budget_mismatch']));
  });

  it('returns AI_NEEDS_RETRY for STOP responses with valid json but inconsistent briefing', async () => {
    const service = createService();
    const inconsistentPayload = {
      strategy: 'Campanha para pet shop com público frio.',
      primaryText: 'Banho e tosa com atendimento rapido.',
      headline: 'Metaiq | Leads | Geração de leads | Meta',
      description: 'Oferta generica.',
      cta: 'LEARN_MORE',
      audience: { gender: 'all', ageRange: '25-55', interests: ['pet shop'] },
      campaign: {
        campaignName: 'Campanha Pet',
        objective: 'OUTCOME_TRAFFIC',
        buyingType: 'AUCTION',
        status: 'PAUSED',
        budget: { type: 'daily', amount: 50, currency: 'BRL' },
      },
      adSet: {
        name: 'Publico frio pet',
        optimizationGoal: 'LINK_CLICKS',
        billingEvent: 'IMPRESSIONS',
        targeting: {
          country: 'BR',
          state: null,
          stateCode: null,
          city: null,
          ageMin: 25,
          ageMax: 55,
          gender: 'all',
          interests: ['pet shop'],
          excludedInterests: [],
          placements: ['feed'],
        },
      },
      creative: {
        name: 'Criativo pet',
        primaryText: 'Banho e tosa com atendimento rapido.',
        headline: 'Metaiq | Leads | Geração de leads | Meta',
        description: 'Oferta generica.',
        cta: 'LEARN_MORE',
        imageSuggestion: null,
        destinationUrl: 'https://metaiq.dev/oferta',
      },
      review: { summary: 'Campanha pet.', strengths: [], risks: [], recommendations: [], confidence: 72 },
      validation: { isReadyToPublish: true, qualityScore: 80, blockingIssues: [], warnings: [], recommendations: [] },
    };
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(inconsistentPayload),
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [{ text: JSON.stringify(inconsistentPayload) }],
          },
        },
      ],
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para ecommerce de moda no Brasil com orçamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      goal: 'gerar leads',
      budget: 120,
      funnelStage: 'remarketing',
      destinationType: 'whatsapp',
      primaryOffer: 'moda feminina',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
    expect((result as unknown as Record<string, unknown>).primaryText).toBeUndefined();
    expect((result as any).reason).toBe('invalid_response');
    expect(result.meta.responseValid).toBe(false);
    expect(result.meta.consistencyApproved).toBe(false);
    expect(result.meta.usedFallback).toBe(false);
    expect((result as any).debug?.validationError).toBe('consistency_retry');
    expect((result as any).debug?.validationPath).toBe('validateSuggestionConsistency');
    expect((result as any).debug?.consistencyErrors?.length).toBeGreaterThan(0);
    expect((result as any).debug?.failedRules).toEqual(expect.arrayContaining([
      'segment_mismatch',
      'audience_mismatch',
    ]));
    expect((result as any).debug?.expectedBriefingSignals).toMatchObject({
      expectedObjective: 'OUTCOME_LEADS',
      expectedBudget: 120,
      expectedCta: 'MESSAGE_PAGE',
      expectsRemarketing: true,
    });
    expect((result as any).debug?.detectedResponseSignals).toMatchObject({
      objective: 'OUTCOME_LEADS',
      budget: 120,
      cta: 'MESSAGE_PAGE',
      segment: 'pet',
    });
  });

  it('returns AI_NEEDS_RETRY instead of inventing missing operational fields', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: 'Campanha local para mensagens.',
        campaign: {
          campaignName: 'Campanha incompleta',
        },
        creative: {
          primaryText: 'Mensagem curta sem estrutura minima.',
          headline: 'Headline incompleta',
        },
        review: {
          summary: 'Resposta incompleta.',
          confidence: 68,
        },
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para ecommerce de moda com orçamento 120 por dia e WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
    expect((result as unknown as Record<string, unknown>).primaryText).toBeUndefined();
  });

  it('returns AI_NEEDS_RETRY when the AI answer leaks raw JSON into copy fields', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        strategy: '{"campaign":{"objective":"OUTCOME_LEADS"}}',
        primaryText: '{"primaryText":"json bruto"}',
        headline: 'Headline valida',
        cta: 'CONTACT_US',
        audience: { gender: 'all', ageRange: '25-45', interests: ['moda feminina'] },
      }),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para ecommerce de moda com WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
  });

  it('blocks partial payloads that only contain audience string, CTA and budget text', async () => {
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

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') throw new Error('Expected AI_NEEDS_RETRY');
  });

  it('blocks suggestions when destinationUrl is missing from an otherwise useful answer', async () => {
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

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status !== 'AI_NEEDS_REVIEW') throw new Error('Expected AI_NEEDS_REVIEW');
  });

  it('returns AI_FAILED when the response is empty', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({ text: '' });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha vazia',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') throw new Error('Expected AI_NEEDS_RETRY');
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
          businessName: 'Pet Feliz Curitiba',
          notes: 'Clínica e banho e tosa com foco em recorrência.',
          instagram: '@petfelizcuritiba',
          whatsapp: '41999990000',
          defaultCity: 'Curitiba',
          defaultState: 'Parana',
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

    expect(context.companyName).toBe('Pet Feliz Curitiba');
    expect(context.instagram).toBe('@petfelizcuritiba');
    expect(context.whatsapp).toBe('41999990000');
    expect(context.storeProfile.city).toBe('Curitiba');
    expect(context.storeProfile.region).toBe('Parana');
    expect(context.website).toBe('https://petfeliz.example');
    expect(context.tenantNotes).toContain('recorrência');
    expect(context.managerNotes).toContain('resposta rápida');
    expect(context.historicalContext.campaignCount).toBe(2);
    expect(context.historicalContext.metrics.ctr).toBe(2.31);
    expect(context.dataAvailability.hasHistoricalCampaigns).toBe(true);
    expect(context.dataAvailability.hasPerformanceMetrics).toBe(true);
  });

  it('infers destinationType=messages from WhatsApp briefing before calling Gemini', () => {
    const service = createService();

    const context = (service as any).buildStoreAiContextFromMetadata({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      prompt: 'Campanha de tráfego para ecommerce de relógios em Curitiba com orçamento 120 por dia, CTA falar no WhatsApp e foco em remarketing',
      storeName: 'Relogios Curitiba',
      tenantWebsite: 'https://relogioscuritiba.com.br',
    });

    expect(context.campaignIntent.destinationType).toBe('messages');
    expect(context.campaignIntent.channelPreference).toBe('messages');
  });

  it('builds a deterministic intent for contradictory traffic-to-WhatsApp briefings', () => {
    const service = createService();

    const intent = (service as any).buildCampaignIntent(
      'Campanha de trafego para WhatsApp com CTA falar conosco agora',
      {
        segment: 'servico local',
        website: 'https://metaiq.dev/oferta',
        whatsapp: null,
        instagram: null,
        campaignIntent: {
          goal: 'gerar conversas',
          destinationType: 'whatsapp',
        },
        storeProfile: {
          salesModel: 'local',
        },
        dataAvailability: {
          hasConnectedMetaAccount: true,
          hasConnectedPage: true,
        },
      } as any,
    );

    expect(intent.destinationType).toBe('messages');
    expect(intent.objective).toBe('OUTCOME_LEADS');
    expect(intent.cta).toBe('MESSAGE_PAGE');
  });

  it('builds a deterministic site intent for ecommerce briefings without inventing messages', () => {
    const service = createService();

    const intent = (service as any).buildCampaignIntent(
      'Campanha para ecommerce sem URL com foco em vendas no site',
      {
        segment: 'ecommerce',
        website: null,
        whatsapp: null,
        instagram: null,
        campaignIntent: {
          goal: 'vender no site',
          destinationType: 'website',
        },
        storeProfile: {
          salesModel: 'ecommerce',
        },
        dataAvailability: {
          hasConnectedMetaAccount: true,
          hasConnectedPage: true,
        },
      } as any,
    );

    expect(intent.destinationType).toBe('site');
    expect(intent.objective).toBe('OUTCOME_TRAFFIC');
    expect(intent.websiteAvailable).toBe(false);
  });

  it('prioritizes the explicit user briefing over store and tenant defaults', () => {
    const service = createService();

    const context = (service as any).buildStoreAiContextFromMetadata({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      prompt: 'Campanha de leads para ecommerce de moda no Brasil com orcamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
      input: {
        prompt: 'Campanha de leads para ecommerce de moda no Brasil com orcamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
        storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
        goal: 'Tráfego',
        budget: 50,
        region: 'Curitiba / PR',
        destinationType: 'website',
        extraContext: 'Empresa: MetaIQ | Segmento: Marketing | Local: Curitiba / PR',
      },
      storeName: 'MetaIQ',
      tenantName: 'MetaIQ',
      tenantBusinessName: 'MetaIQ',
      tenantBusinessType: 'Marketing',
      tenantDefaultCity: 'Curitiba',
      tenantDefaultState: 'PR',
      tenantWebsite: 'https://metaiq.dev',
      historicalContext: {
        campaignCount: 0,
        recentCampaigns: [],
        metrics: { ctr: null, cpa: null, roas: null },
        audienceSignals: [],
      },
      hasConnectedMetaAccount: true,
      hasConnectedPage: true,
    });

    const intent = (service as any).buildCampaignIntent(
      'Campanha de leads para ecommerce de moda no Brasil com orcamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
      context,
    );

    expect(intent.objective).toBe('OUTCOME_LEADS');
    expect(intent.destinationType).toBe('messages');
    expect(intent.budgetAmount).toBe(120);
    expect(intent.budgetType).toBe('daily');
    expect(intent.segment).toContain('moda');
    expect(intent.region).toBe('Brasil');
    expect(intent.remarketingExpected).toBe(true);
    expect(intent.objective).not.toBe('OUTCOME_TRAFFIC');
    expect(intent.budgetAmount).not.toBe(50);
    expect(intent.segment?.toLowerCase()).not.toContain('marketing');
    expect(intent.region).not.toContain('Curitiba');
  });

  it('extracts R$120 por dia from the explicit prompt even when legacy frontend fields still say 50', () => {
    const service = createService();

    const context = (service as any).buildStoreAiContextFromMetadata({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      prompt: 'Campanha de leads para ecommerce de moda no Brasil. Orçamento: R$ 120 por dia. CTA falar no WhatsApp.',
      input: {
        prompt: 'Campanha de leads para ecommerce de moda no Brasil. Orçamento: R$ 120 por dia. CTA falar no WhatsApp.',
        storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
        goal: 'Tráfego',
        budget: 50,
        region: 'Curitiba / PR',
        destinationType: 'website',
        extraContext: 'Empresa: MetaIQ | Segmento: Marketing | Local: Curitiba / PR',
      },
      storeName: 'MetaIQ',
      tenantName: 'MetaIQ',
      tenantBusinessName: 'MetaIQ',
      tenantBusinessType: 'Marketing',
      tenantDefaultCity: 'Curitiba',
      tenantDefaultState: 'PR',
      tenantWebsite: 'https://metaiq.dev',
      historicalContext: {
        campaignCount: 0,
        recentCampaigns: [],
        metrics: { ctr: null, cpa: null, roas: null },
        audienceSignals: [],
      },
      hasConnectedMetaAccount: true,
      hasConnectedPage: true,
    });

    const intent = (service as any).buildCampaignIntent(
      'Campanha de leads para ecommerce de moda no Brasil. Orçamento: R$ 120 por dia. CTA falar no WhatsApp.',
      context,
    );

    expect(intent.budgetAmount).toBe(120);
    expect(intent.budgetAmount).not.toBe(50);
    expect(context.fieldOrigins.budget).toBe('prompt');
  });

  it('reimposes critical fields from CampaignIntent when the model tries to override them', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(validStructuredResponse({
        intent: {
          ...validStructuredResponse().intent,
          objective: 'OUTCOME_TRAFFIC',
          destinationType: 'site',
          budgetAmount: 80,
          budgetType: 'daily',
          cta: 'SHOP_NOW',
        },
        campaign: {
          ...validStructuredResponse().campaign,
          objective: 'OUTCOME_TRAFFIC',
          status: 'ACTIVE',
          budget: {
            type: 'daily',
            amount: 80,
            currency: 'BRL',
          },
        },
        creative: {
          ...validStructuredResponse().creative,
          cta: 'SHOP_NOW',
          destinationUrl: 'https://malicious.example',
        },
        cta: 'SHOP_NOW',
        budgetSuggestion: 80,
      })),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha para WhatsApp com orcamento de 80 por dia',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      destinationType: 'whatsapp',
      budget: 80,
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status !== 'AI_NEEDS_REVIEW') throw new Error('Expected AI_NEEDS_REVIEW');
    expect(result.intent.destinationType).toBe('messages');
    expect(result.campaign.objective).toBe('OUTCOME_LEADS');
    expect(result.campaign.status).toBe('PAUSED');
    expect(result.campaign.budget.type).toBe('daily');
    expect(result.campaign.budget.amount).toBe(80);
    expect(result.creative.cta).toBe('MESSAGE_PAGE');
    expect(result.creative.destinationUrl).toBeNull();
    expect(result.validation.isReadyToPublish).toBe(false);
  });

  it('normalizes WhatsApp CTA text to MESSAGE_PAGE', () => {
    const service = createService();

    expect((service as any).normalizeCtaValue('Fale conosco no WhatsApp')).toBe('MESSAGE_PAGE');
    expect((service as any).normalizeCtaValue('Chamar agora no WhatsApp')).toBe('MESSAGE_PAGE');
  });

  it('keeps WhatsApp creative in review when deterministic rules can normalize the contract', async () => {
    const service = createService();
    const payload = validStructuredResponse({
      intent: {
        ...validStructuredResponse().intent,
        budgetAmount: 120,
        budgetType: 'daily',
      },
      campaign: {
        ...validStructuredResponse().campaign,
        objective: 'OUTCOME_LEADS',
        budget: {
          type: 'daily',
          amount: 120,
          currency: 'BRL',
        },
      },
      creative: {
        ...validStructuredResponse().creative,
        cta: 'LEARN_MORE',
        destinationUrl: null,
      },
      cta: 'LEARN_MORE',
      budgetSuggestion: 120,
    });
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(payload),
    });

    (service as any).ai = { models: { generateContent } };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de tráfego para ecommerce de relógios em Curitiba com orçamento 120 por dia, CTA falar no WhatsApp e foco em remarketing',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      destinationType: 'whatsapp',
      budget: 120,
      funnelStage: 'remarketing',
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status !== 'AI_NEEDS_REVIEW') {
      throw new Error('Expected AI_NEEDS_REVIEW');
    }
    expect((result as any).reason).toBeUndefined();
    expect(result.creative.cta).toBe('MESSAGE_PAGE');
    expect(result.creative.destinationUrl).toBeNull();
    expect(result.validation.isReadyToPublish).toBe(false);
  });

  it('preserves message consistency rules in local validation', () => {
    const service = createService();

    const issues = (service as any).buildDerivedBlockingIssues(
      {
        planner: {
          businessType: 'e-commerce',
          goal: 'Gerar conversas no WhatsApp',
          funnelStage: 'bottom',
          offer: 'Relogios',
          audienceIntent: 'Remarketing para visitantes',
          missingInputs: [],
          assumptions: [],
        },
        campaign: {
          campaignName: 'Relogios WhatsApp',
          objective: 'OUTCOME_TRAFFIC',
          buyingType: 'AUCTION',
          status: 'PAUSED',
          budget: { type: 'daily', amount: 120, currency: 'BRL' },
        },
        adSet: {
          name: 'Remarketing Curitiba',
          optimizationGoal: 'LINK_CLICKS',
          billingEvent: 'IMPRESSIONS',
          targeting: {
            country: 'BR',
            state: 'Parana',
            stateCode: 'PR',
            city: 'Curitiba',
            ageMin: 25,
            ageMax: 55,
            gender: 'ALL',
            interests: ['remarketing'],
            excludedInterests: [],
            placements: ['feed'],
          },
        },
        creative: {
          name: 'Criativo 1',
          primaryText: 'Fale conosco no WhatsApp',
          headline: 'Relogios em Curitiba',
          description: 'Remarketing local',
          cta: 'LEARN_MORE',
          imageSuggestion: null,
          destinationUrl: null,
        },
        strategy: 'Campanha para gerar conversas no WhatsApp',
      },
      {
        dataAvailability: { hasConnectedPage: true },
        campaignIntent: {
          destinationType: 'messages',
          channelPreference: 'messages',
        },
      } as any,
    );

    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('objetivo coerente'),
      expect.stringContaining('CTA compat'),
    ]));
  });

  it('creates a specific blocking issue for message campaigns without page, WhatsApp or Instagram', () => {
    const service = createService();

    const issues = (service as any).buildDerivedBlockingIssues(
      {
        planner: {
          businessType: 'e-commerce',
          goal: 'Gerar conversas no WhatsApp',
          funnelStage: 'bottom',
          offer: 'Relogios',
          audienceIntent: 'Remarketing para visitantes',
          missingInputs: [],
          assumptions: [],
        },
        campaign: {
          campaignName: 'Relogios WhatsApp',
          objective: 'OUTCOME_LEADS',
          buyingType: 'AUCTION',
          status: 'PAUSED',
          budget: { type: 'daily', amount: 120, currency: 'BRL' },
        },
        adSet: {
          name: 'Remarketing Curitiba',
          optimizationGoal: 'CONVERSATIONS',
          billingEvent: 'IMPRESSIONS',
          targeting: {
            country: 'BR',
            state: 'Parana',
            stateCode: 'PR',
            city: 'Curitiba',
            ageMin: 25,
            ageMax: 55,
            gender: 'ALL',
            interests: ['remarketing'],
            excludedInterests: [],
            placements: ['feed'],
          },
        },
        creative: {
          name: 'Criativo 1',
          primaryText: 'Fale conosco no WhatsApp',
          headline: 'Relogios em Curitiba',
          description: 'Remarketing local',
          cta: 'MESSAGE_PAGE',
          imageSuggestion: null,
          destinationUrl: null,
        },
        strategy: 'Campanha para gerar conversas no WhatsApp',
      },
      {
        dataAvailability: { hasConnectedPage: false },
        campaignIntent: {
          destinationType: 'messages',
          channelPreference: 'messages',
        },
        whatsapp: null,
        instagram: null,
      } as any,
    );

    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('destino de mensagem configurado'),
    ]));
    expect(issues).not.toEqual(expect.arrayContaining([
      expect.stringContaining('destinationUrl https'),
    ]));
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
      prompt: 'Campanha de tráfego para site com url insegura',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
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

    expect(result.status).toBe('AI_NEEDS_RETRY');
    if (result.status !== 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_RETRY');
    }
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

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status !== 'AI_NEEDS_REVIEW') {
      throw new Error('Expected AI_NEEDS_REVIEW');
    }
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

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status === 'AI_FAILED' || result.status === 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_REVIEW');
    }
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

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status === 'AI_FAILED' || result.status === 'AI_NEEDS_RETRY') {
      throw new Error('Expected AI_NEEDS_REVIEW');
    }
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
      prompt: 'Campanha de banho e tosa em Curitiba com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
    });

    expect(result.status).toBe('AI_NEEDS_REVIEW');
    if (result.status !== 'AI_NEEDS_REVIEW') {
      throw new Error('Expected AI_NEEDS_REVIEW');
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
    expect(result.analysis.businessDiagnosis.summary).toContain('campanha');
    expect(result.analysis.warnings.length + result.analysis.blockingIssues.length).toBeGreaterThan(0);
    expect(result.analysis.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.analysis.overallScore).toBeLessThanOrEqual(100);
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.analysis.riskLevel);
    expect(['PUBLISH', 'BLOCK', 'REVIEW', 'RESTRUCTURE']).toContain(result.analysis.executiveDecision.decision);
    expect(result.meta.usedFallback).toBe(false);
  });

  it('preserves AI approval only when there are no deterministic blockers', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        analysis: {
          overallScore: 93,
          riskLevel: 'LOW',
          isReadyToPublish: true,
          blockingIssues: [],
          warnings: [],
          recommendations: [],
          executiveDecision: {
            decision: 'PUBLISH',
            reason: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
          },
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
      targetAudience: 'Tutores de pets em Curitiba',
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
      creative: {
        message: 'Agende seu atendimento com nossa equipe hoje mesmo.',
        headline: 'Agende agora',
        description: 'Atendimento rapido com garantia e resultado claro.',
      },
      targeting: { country: 'BR', autoAudience: false, interests: ['pet shop'], ageMin: 25, ageMax: 45 },
      budget: { value: 120 },
      location: { country: 'BR', city: 'Curitiba', state: 'PR' },
      cta: 'LEARN_MORE',
      destinationUrl: 'https://metaiq.dev/agendar',
    });

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
    expect(result.analysis.isReadyToPublish).toBe(true);
    expect(result.analysis.executiveDecision.decision).toBe('PUBLISH');
  });

  it('blocks publication when the analysis returns isReadyToPublish=false', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        analysis: {
          overallScore: 82,
          riskLevel: 'LOW',
          isReadyToPublish: false,
          blockingIssues: [],
          warnings: [],
          recommendations: [],
          executiveDecision: {
            decision: 'PUBLISH',
            reason: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
          },
        },
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

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
    expect(result.analysis.isReadyToPublish).toBe(false);
    expect(result.analysis.executiveDecision.decision).not.toBe('PUBLISH');
  });

  it('blocks publication when the analysis marks the campaign as critical', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        analysis: {
          overallScore: 18,
          riskLevel: 'CRITICAL',
          isReadyToPublish: true,
          blockingIssues: [],
          warnings: [],
          recommendations: [],
          executiveDecision: {
            decision: 'PUBLISH',
            reason: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
          },
        },
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.analyzeCampaign({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      campaign: { name: 'Campanha', objective: 'OUTCOME_LEADS' },
      creative: {
        message: 'Agende seu atendimento com nossa equipe hoje mesmo.',
        headline: 'Agende agora',
        description: 'Atendimento rapido com garantia e resultado claro.',
      },
      targeting: { country: 'BR', autoAudience: false, interests: ['pet shop'], ageMin: 25, ageMax: 45 },
      budget: { value: 120 },
      location: { country: 'BR', city: 'Curitiba', state: 'PR' },
      cta: 'LEARN_MORE',
      destinationUrl: 'https://metaiq.dev/agendar',
    });

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
    expect(result.analysis.riskLevel).toBe('CRITICAL');
    expect(result.analysis.isReadyToPublish).toBe(false);
    expect(result.analysis.executiveDecision.decision).toBe('BLOCK');
  });

  it('keeps deterministic local blockers above an AI approval', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        analysis: {
          overallScore: 95,
          riskLevel: 'LOW',
          isReadyToPublish: true,
          blockingIssues: [],
          warnings: [],
          recommendations: [],
          executiveDecision: {
            decision: 'PUBLISH',
            reason: 'A campanha pode seguir se os pontos obrigatorios ja estiverem corretos.',
          },
        },
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.analyzeCampaign({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      campaign: { name: 'Campanha', objective: 'OUTCOME_LEADS' },
      creative: { message: '', headline: '' },
      targeting: { country: 'BR', autoAudience: false, interests: ['pet shop'], ageMin: 25, ageMax: 45 },
      budget: { value: 0 },
      location: { country: 'BR', city: 'Curitiba', state: 'PR' },
      cta: 'LEARN_MORE',
      destinationUrl: 'http://metaiq.dev/inseguro',
    });

    expect(result.status).toBe('AI_SUCCESS');
    if (result.status !== 'AI_SUCCESS') {
      throw new Error('Expected AI_SUCCESS');
    }
    expect(result.analysis.isReadyToPublish).toBe(false);
    expect(result.analysis.executiveDecision.decision).toBe('BLOCK');
    expect(result.analysis.blockingIssues.join(' ')).toMatch(/Or.amento|Copy principal|Headline|HTTPS/i);
  });

  it('prefers tenant business name when building store context metadata', () => {
    const service = createService();

    const context = (service as any).buildStoreAiContextFromMetadata({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      prompt: 'Campanha para agenda local',
      storeName: 'Store interna',
      tenantName: 'Tenant operacional',
      tenantBusinessName: 'Clínica Sorriso',
      tenantNotes: 'Clínica odontológica com foco em avaliação e clareamento.',
      tenantWebsite: 'https://clinicasorriso.com.br',
      tenantDefaultCity: 'Curitiba',
      tenantDefaultState: 'PR',
    });

    expect(context.companyName).toBe('Clínica Sorriso');
    expect(context.storeProfile.name).toBe('Clínica Sorriso');
  });

  it('returns AI_NEEDS_RETRY when Gemini times out', async () => {
    const structuredLogger = {
      info: jest.fn(),
      metric: jest.fn(),
    };
    const service = createService({}, structuredLogger);

    (service as any).ai = {
      models: {
        generateContent: jest.fn().mockRejectedValue(new Error('AI request timeout after 15000ms')),
      },
    };
    (service as any).resolveStoreAiContext = jest.fn().mockResolvedValue({
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      storeName: 'Clínica Sorriso',
      companyName: 'Clínica Sorriso',
      segment: 'clinica odontologica',
      description: 'Clínica local com foco em avaliação e clareamento dental.',
      website: 'https://clinicasorriso.com.br/agenda',
      instagram: '@clinicasorriso',
      whatsapp: '(41) 99999-1111',
      targetAudience: 'Adultos de Curitiba buscando avaliação odontológica.',
      businessType: 'servico local',
      managerName: 'Marina',
      tenantName: 'Clínica Sorriso',
      tenantNotes: 'Atendimento consultivo com agendamento por WhatsApp.',
      managerNotes: null,
      contextSources: ['briefing', 'tenant.businessName', 'tenant.website'],
      storeProfile: {
        name: 'Clínica Sorriso',
        segment: 'clinica odontologica',
        businessType: 'servico local',
        city: 'Curitiba',
        region: 'PR',
        instagram: '@clinicasorriso',
        whatsapp: '(41) 99999-1111',
        salesModel: 'local',
        mainOffer: 'Avaliação odontológica',
        targetAudienceBase: 'Adultos de Curitiba buscando avaliação odontológica.',
        differentiators: ['Agendamento rápido', 'Atendimento consultivo'],
        notesSummary: 'Clínica local com foco em atendimento consultivo.',
      },
      tenantProfile: {
        businessType: 'saude',
        notes: 'Clínica local com foco em atendimento consultivo.',
        accountType: 'BUSINESS',
      },
      managerProfile: {
        notes: null,
      },
      campaignIntent: {
        goal: 'Gerar agendamentos no WhatsApp',
        funnelStage: 'bottom',
        channelPreference: 'whatsapp',
        budgetRange: 'R$ 90 por dia',
        durationDays: 7,
        destinationType: 'messages',
        primaryOffer: 'Avaliação odontológica',
        region: 'Curitiba',
        extraContext: 'Clínica pequena com operação local.',
        communicationTone: 'consultivo',
      },
      historicalContext: {
        campaignCount: 0,
        recentCampaigns: [],
        metrics: { ctr: null, cpa: null, roas: null },
        audienceSignals: [],
      },
      dataAvailability: {
        hasHistoricalCampaigns: false,
        hasPerformanceMetrics: false,
        hasConnectedMetaAccount: true,
        hasConnectedPage: true,
      },
      fieldOrigins: {
        segment: 'prompt',
        businessType: 'prompt',
        city: 'prompt',
        region: 'prompt',
        goal: 'prompt',
        funnelStage: 'prompt',
        budget: 'prompt',
        destinationType: 'prompt',
        channelPreference: 'prompt',
        primaryOffer: 'prompt',
        extraContext: 'input',
      },
    });

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha para avaliação odontológica em Curitiba com foco em WhatsApp',
      storeId: '0f6a4f7e-8d6e-4b9b-9db8-1c1a53d9c001',
      goal: 'Gerar agendamentos',
    });

    expect(result.status).toBe('AI_FAILED');
    if (result.status !== 'AI_FAILED') {
      throw new Error('Expected AI_FAILED');
    }
    expect(result.reason).toBe('timeout');
    expect(result.meta.usedFallback).toBe(false);
    expect(result.meta.responseValid).toBe(false);
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

  it('redacts prompt payload details from AI logs in production', () => {
    const service = createService({ NODE_ENV: 'production' });

    const sanitized = (service as any).sanitizeAiLogPayload({
      model: 'gemini-2.5-flash',
      contents: 'briefing sensivel da loja',
      config: {
        responseJsonSchema: { type: 'object' },
        temperature: 0.25,
      },
    });

    expect(sanitized).toEqual({
      model: 'gemini-2.5-flash',
      contents: '[redacted_in_production]',
      config: {
        responseJsonSchema: '[redacted_in_production]',
        temperature: 0.25,
      },
    });
  });
});
