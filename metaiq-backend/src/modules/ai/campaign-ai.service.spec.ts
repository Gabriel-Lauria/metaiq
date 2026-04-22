import {
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignAiService } from './campaign-ai.service';

describe('CampaignAiService', () => {
  function createService(overrides: Record<string, unknown> = {}, storeRepository?: any): CampaignAiService {
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

    return new CampaignAiService(config, storeRepository);
  }

  const qualityCases = [
    {
      niche: 'moda',
      prompt: 'Campanha de moda feminina para vestidos leves de verão em São Paulo, R$ 120 por dia, foco em WhatsApp.',
      response: {
        name: 'Vestidos Verão SP | WhatsApp',
        audience: 'Mulheres de 24 a 44 anos em São Paulo, interessadas em moda feminina, vestidos, lojas online, tendências de verão e compras pelo Instagram.',
        strategy: 'Objetivo de leads/mensagens para capturar conversas no WhatsApp, iniciando com público frio de intenção e remarketing de engajamento, otimizando por conversas qualificadas.',
        copy: 'Vestidos leves para dias quentes em São Paulo. Escolha seu look de verão com atendimento rápido pelo WhatsApp e receba ajuda para encontrar o modelo ideal.',
        budgetSuggestion: 'Usar R$ 120 por dia, revisar custo por conversa após 72 horas e escalar os criativos com melhor taxa de resposta.',
        creativeIdeas: [
          'Reels: troca de looks em 5 segundos com texto "vestido leve para o verão"',
          'Carrossel: 4 modelos por ocasião com CTA para WhatsApp',
          'Imagem estática: vestido hero + benefício de conforto no calor',
          'Stories: enquete de cor preferida com botão de mensagem',
        ],
      },
    },
    {
      niche: 'suplementos',
      prompt: 'Venda de creatina e whey para academia, público Brasil, R$ 200 por dia, tráfego para ecommerce.',
      response: {
        name: 'Suplementos Performance | Ecommerce',
        audience: 'Homens e mulheres de 20 a 40 anos no Brasil, interessados em musculação, academia, creatina, whey protein, treino de força e vida saudável.',
        strategy: 'Objetivo de tráfego/conversão para ecommerce, separando público frio fitness e remarketing de visitantes, com otimização por cliques qualificados e compras sem promessas médicas.',
        copy: 'Complete sua rotina de treino com creatina e whey de forma prática. Compare opções, veja detalhes dos produtos e compre online com segurança.',
        budgetSuggestion: 'Usar R$ 200 por dia, começando com 70% em aquisição e 30% em remarketing, revisando CPA e CTR em 3 dias.',
        creativeIdeas: [
          'Vídeo curto: rotina de preparo do shake + benefício prático',
          'Imagem estática: combo creatina + whey com diferenciais claros',
          'Carrossel: quando usar cada suplemento sem prometer resultado médico',
          'Stories: pergunta sobre objetivo de treino com CTA para loja',
        ],
      },
    },
    {
      niche: 'pet',
      prompt: 'Pet shop com banho e tosa em Curitiba, gerar agendamentos via direct, orçamento 80/dia.',
      response: {
        name: 'Banho e Tosa Curitiba | Direct',
        audience: 'Tutores de cães e gatos em Curitiba, 25 a 55 anos, interessados em pet shop, banho e tosa, cuidados pet, rações premium e serviços próximos.',
        strategy: 'Objetivo de leads/mensagens para agendamento no Direct, com segmentação local e criativos de confiança, otimizando pelo volume de conversas com intenção de horário.',
        copy: 'Seu pet limpo, cheiroso e bem cuidado em Curitiba. Chame no Direct, consulte horários disponíveis e agende banho e tosa com praticidade.',
        budgetSuggestion: 'Usar R$ 80 por dia, concentrando entrega em raio local e revisando custo por agendamento após 3 dias.',
        creativeIdeas: [
          'Antes e depois: transformação do banho e tosa com autorização do tutor',
          'Stories: agenda da semana com horários disponíveis',
          'Imagem estática: pet feliz + chamada para agendar pelo Direct',
          'Vídeo curto: bastidores do cuidado durante o serviço',
        ],
      },
    },
    {
      niche: 'eletrônicos',
      prompt: 'Promoção de fones bluetooth e carregadores rápidos para ecommerce de eletrônicos, R$ 150 diário.',
      response: {
        name: 'Eletrônicos Essenciais | Promo',
        audience: 'Consumidores de 18 a 45 anos no Brasil, interessados em tecnologia, smartphones, acessórios eletrônicos, fones bluetooth, carregadores rápidos e compras online.',
        strategy: 'Objetivo de tráfego/conversão para ecommerce, com criativos de oferta e comparação de uso, separando aquisição ampla e remarketing de carrinho.',
        copy: 'Fones bluetooth e carregadores rápidos para facilitar seu dia. Veja as ofertas do ecommerce e escolha acessórios úteis para trabalho, treino e rotina.',
        budgetSuggestion: 'Usar R$ 150 por dia, testando 3 criativos por 72 horas e realocando verba para o menor custo por clique qualificado.',
        creativeIdeas: [
          'Vídeo curto: fone em uso no treino, trabalho e transporte',
          'Imagem estática: carregador rápido + chamada de praticidade',
          'Carrossel: fones, cabos e carregadores por cenário de uso',
          'Stories: oferta relâmpago com CTA para visitar a loja',
        ],
      },
    },
    {
      niche: 'leads',
      prompt: 'Gerar leads para consultoria financeira B2B, empresas pequenas, formulário, budget 300 por dia.',
      response: {
        name: 'Leads Consultoria Financeira B2B',
        audience: 'Donos e gestores de pequenas empresas, 28 a 55 anos, interessados em gestão financeira, fluxo de caixa, B2B, empreendedorismo e consultoria empresarial.',
        strategy: 'Objetivo de leads com formulário, oferecendo diagnóstico financeiro como isca, qualificando por porte da empresa e urgência de organização do caixa.',
        copy: 'Sua empresa sabe exatamente para onde o dinheiro está indo? Solicite um diagnóstico financeiro e veja oportunidades para organizar fluxo de caixa e decisões.',
        budgetSuggestion: 'Usar R$ 300 por dia, monitorando CPL, taxa de qualificação e custo por reunião marcada.',
        creativeIdeas: [
          'Imagem estática: pergunta forte sobre fluxo de caixa',
          'Vídeo curto: consultor explicando 3 sinais de desorganização financeira',
          'Carrossel: erros comuns em pequenas empresas e CTA para diagnóstico',
          'Form ad: benefício do diagnóstico + campos de qualificação',
        ],
      },
    },
    {
      niche: 'infoproduto',
      prompt: 'Infoproduto de inglês para adultos iniciantes, lançamento com aula gratuita, orçamento total R$ 2.000.',
      response: {
        name: 'Aula Gratuita Inglês Iniciantes',
        audience: 'Adultos iniciantes em inglês, 25 a 50 anos, interessados em carreira, viagens, cursos online, aprendizado de idiomas e desenvolvimento profissional.',
        strategy: 'Objetivo de leads para inscrição na aula gratuita, aquecendo público frio com promessa educacional realista e remarketing para inscritos e engajados.',
        copy: 'Quer destravar o inglês começando do básico? Participe de uma aula gratuita para adultos iniciantes e entenda um caminho simples para estudar com consistência.',
        budgetSuggestion: 'Usar R$ 2.000 como orçamento total do lançamento, distribuindo verba entre captação inicial e remarketing nos últimos dias.',
        creativeIdeas: [
          'Vídeo curto: professor quebrando uma objeção comum de adultos iniciantes',
          'Imagem estática: convite para aula gratuita com data e benefício',
          'Carrossel: 3 erros que travam o inglês no começo',
          'Stories: caixa de pergunta sobre maior dificuldade com inglês',
        ],
      },
    },
    {
      niche: 'serviços',
      prompt: 'Serviço de instalação de ar-condicionado no Rio de Janeiro, leads por WhatsApp, R$ 100/dia.',
      response: {
        name: 'Instalação Ar RJ | WhatsApp',
        audience: 'Moradores e pequenos negócios no Rio de Janeiro, 25 a 60 anos, interessados em ar-condicionado, instalação, manutenção residencial e climatização.',
        strategy: 'Objetivo de leads/mensagens no WhatsApp com segmentação local, destacando agendamento rápido e qualificação por bairro, tipo de aparelho e urgência.',
        copy: 'Precisa instalar ar-condicionado no Rio de Janeiro? Chame no WhatsApp, informe seu bairro e receba orientação para agendar a instalação com praticidade.',
        budgetSuggestion: 'Usar R$ 100 por dia, priorizando bairros atendidos e revisando custo por conversa qualificada após 72 horas.',
        creativeIdeas: [
          'Imagem estática: ambiente climatizado + CTA para orçamento no WhatsApp',
          'Vídeo curto: passo a passo do agendamento sem mostrar dados sensíveis',
          'Carrossel: tipos de instalação e cuidados antes do serviço',
          'Stories: chamada por bairro com botão para conversa',
        ],
      },
    },
  ];

  function scoreQuality(response: any, prompt: string): Record<string, boolean> {
    const budgetToken = prompt.match(/r\$\s*\d+|\b\d{2,5}\s*(?:por dia|\/dia|di[aá]rio|total)?/i)?.[0]?.replace(/\s+/g, ' ');

    return {
      name: response.name.length >= 12 && response.name.length <= 80 && !/campanha gerada|teste/i.test(response.name),
      audience: response.audience.length >= 90 && /(interess|anos|brasil|são paulo|curitiba|rio de janeiro|empresas)/i.test(response.audience),
      strategy: response.strategy.length >= 100 && /(objetivo|funil|otimiz|lead|tráfego|trafego|mensagens|formulário|formulario)/i.test(response.strategy),
      copy: response.copy.length >= 90 && /(whatsapp|direct|compre|solicite|participe|agende|veja|chame)/i.test(response.copy),
      budget: response.budgetSuggestion.length >= 50 && (!budgetToken || response.budgetSuggestion.includes(budgetToken.replace(/\s*(por dia|\/dia|di[aá]rio|total)$/i, '').trim())),
      creativeIdeas: Array.isArray(response.creativeIdeas) && response.creativeIdeas.length === 4 && response.creativeIdeas.every((idea: string) => idea.length >= 35),
    };
  }

  function validCampaignSuggestionResponse(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Leads Aptos Alto Padrão Curitiba',
      audience: 'Pessoas de 30 a 60 anos em Curitiba, interessadas em imóveis de alto padrão, investimento imobiliário, arquitetura e financiamento.',
      strategy: 'Objetivo de leads com formulário ou WhatsApp, público frio qualificado e remarketing de engajados, otimizando por contato qualificado.',
      copy: 'Conheça apartamentos de alto padrão em Curitiba e receba uma curadoria com opções alinhadas ao seu perfil. Fale com a equipe e tire dúvidas.',
      budgetSuggestion: 'Usar R$ 180 por dia, revisar CPL e taxa de qualificação após 72 horas antes de escalar.',
      creativeIdeas: [
        'Vídeo curto: tour por detalhes premium do apartamento com CTA para lead',
        'Imagem estática: fachada ou living com texto sobre alto padrão em Curitiba',
        'Carrossel: localização, planta, diferenciais e chamada para atendimento',
        'Stories: enquete sobre região preferida com botão para conversar',
      ],
      ...overrides,
    };
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

  it.each(qualityCases)('generates useful campaign suggestions for $niche', async ({ prompt, response }) => {
    const storeRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'store-quality',
        name: 'Loja Quality Lab',
        manager: { name: 'MetaIQ Manager', notes: 'Operação com campanhas Meta Ads focadas em aquisição qualificada.' },
        tenant: { name: 'MetaIQ Tenant', notes: 'E-commerce com atendimento consultivo e foco em conversão.' },
      }),
    };
    const service = createService({}, storeRepository);
    const generateContent = jest.fn().mockResolvedValue({ text: JSON.stringify(response) });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({ prompt, storeId: 'store-quality' });
    const score = scoreQuality(result, prompt);

    expect(score).toEqual({
      name: true,
      audience: true,
      strategy: true,
      copy: true,
      budget: true,
      creativeIdeas: true,
    });
    expect(generateContent.mock.calls[0][0].contents).toContain('Loja Quality Lab');
    expect(generateContent.mock.calls[0][0].contents).toContain('Segmento:');
    expect(generateContent.mock.calls[0][0].contents).toContain('Público-alvo base:');
    expect(generateContent.mock.calls[0][0].contents).toContain('Tipo de negócio:');
    expect(generateContent.mock.calls[0][0].contents).toContain('É proibido usar termos genéricos');
    expect(generateContent.mock.calls[0][0].contents).toContain('creativeIdeas deve ter exatamente 4 ideias');
  });

  it('adds real store metadata and derived niche context to the campaign AI prompt', async () => {
    const storeRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'store-fitlab',
        name: 'FitLab Suplementos',
        manager: {
          name: 'Grupo FitLab',
          notes: 'Marca fitness com foco em recompra, atendimento via ecommerce e combos de treino.',
        },
        tenant: {
          name: 'FitLab Brasil',
          notes: 'E-commerce de suplementos esportivos para praticantes de musculação que comparam creatina, whey e rotina de academia.',
        },
      }),
    };
    const service = createService({}, storeRepository);
    const generateContent = jest.fn().mockResolvedValue({ text: JSON.stringify(validCampaignSuggestionResponse()) });

    (service as any).ai = {
      models: { generateContent },
    };

    await service.suggestCampaignFormFields({
      prompt: 'Campanha de tráfego para creatina e whey com orçamento R$ 200 por dia.',
      storeId: 'store-fitlab',
    });

    const aiPrompt = generateContent.mock.calls[0][0].contents;

    expect(aiPrompt).toContain('Empresa: FitLab Suplementos');
    expect(aiPrompt).toContain('Segmento: suplementos fitness');
    expect(aiPrompt).toContain('Tipo de negócio: e-commerce');
    expect(aiPrompt).toContain('Público-alvo base: Praticantes de musculação');
    expect(aiPrompt).toContain('tenant.notes');
    expect(aiPrompt).toContain('copy deve ter até 260 caracteres, em português do Brasil, com dor explícita do cliente, benefício claro, prova/gancho e CTA direto');
  });

  it('improves generic Gemini responses with prompt-aware fallbacks', async () => {
    const storeRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'store-generic',
        name: 'Pet Feliz Curitiba',
        manager: { name: 'Grupo Pet', notes: 'Serviço local com agendamentos de banho e tosa por Direct.' },
        tenant: { name: 'Pet Feliz', notes: 'Pet shop em Curitiba para tutores de cães e gatos que precisam agendar cuidado pet.' },
      }),
    };
    const service = createService({}, storeRepository);
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        name: 'Campanha gerada com IA',
        audience: 'Público amplo com segmentação conservadora.',
        strategy: 'Validar mensagem principal com orçamento controlado e otimização gradual.',
        copy: 'Conheça a solução e fale com nosso time para saber mais.',
        budgetSuggestion: '',
        creativeIdeas: ['Imagem do produto'],
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha para pet shop em Curitiba com orçamento R$ 80 por dia',
      storeId: 'store-generic',
    });

    expect(result.name).toContain('Pet Feliz Curitiba');
    expect(result.audience).toContain('Tutores de cães e gatos');
    expect(result.copy).toContain('pet');
    expect(result.copy).toContain('Solicite atendimento agora.');
    expect(result.budgetSuggestion).toContain('R$ 80');
    expect(result.creativeIdeas).toHaveLength(4);
  });

  it('returns a valid campaign suggestion from strict JSON', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        ...validCampaignSuggestionResponse(),
        creativeIdeas: [
          ...validCampaignSuggestionResponse().creativeIdeas,
          'Ideia extra que deve ser cortada para manter exatamente quatro itens',
        ],
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para apartamentos de alto padrão em Curitiba, orçamento R$ 180 por dia',
      storeId: 'store-valid',
    });

    expect(result.name).toBe('Leads Aptos Alto Padrão Curitiba');
    expect(result.creativeIdeas).toHaveLength(4);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('retries once when Gemini returns truncated JSON and then uses the valid response', async () => {
    const service = createService();
    const generateContent = jest
      .fn()
      .mockResolvedValueOnce({
        text: '{"name": "Leads Aptos Alto Padrão Curitiba - Geração de Leads Qualificados", "audience":',
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(validCampaignSuggestionResponse({ name: 'Retry OK Curitiba' })),
      });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para apartamentos de alto padrão em Curitiba, orçamento R$ 180 por dia',
      storeId: 'store-truncated',
    });

    expect(result.name).toBe('Retry OK Curitiba');
    expect(result.creativeIdeas).toHaveLength(4);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('returns a safe fallback when truncated JSON persists after retry', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: '{"name": "Leads Aptos Alto Padrão Curitiba", "audience":',
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para apartamentos de alto padrão em Curitiba com orçamento R$ 180 por dia',
      storeId: 'store-truncated-fallback',
    });

    expect(result.name).toContain('Leads');
    expect(result.audience).toContain('leads');
    expect(result.budgetSuggestion).toContain('R$ 180');
    expect(result.creativeIdeas).toHaveLength(4);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('returns a safe fallback when Gemini returns invalid JSON twice', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: 'isso não é JSON',
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha para pet shop em Curitiba com orçamento R$ 80 por dia',
      storeId: 'store-invalid-json',
    });

    expect(result.name).toContain('Pet');
    expect(result.copy).toContain('pet');
    expect(result.creativeIdeas).toHaveLength(4);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('returns a safe fallback when required fields are missing after retry', async () => {
    const service = createService();
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        name: 'Campanha incompleta',
        audience: 'Público de Curitiba interessado em imóveis',
        copy: 'Fale com nossa equipe.',
        budgetSuggestion: 'R$ 180 por dia',
        creativeIdeas: [
          'Imagem estática: fachada do imóvel com CTA para contato',
          'Vídeo curto: tour pelo apartamento',
          'Carrossel: diferenciais do empreendimento',
          'Stories: chamada para atendimento',
        ],
      }),
    });

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Campanha de leads para apartamentos em Curitiba, orçamento R$ 180 por dia',
      storeId: 'store-missing-field',
    });

    expect(result.strategy).toContain('Campanha de conversão/leads');
    expect(result.budgetSuggestion).toContain('R$ 180');
    expect(result.creativeIdeas).toHaveLength(4);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('returns a safe fallback when Gemini generation fails on all models', async () => {
    const service = createService();
    const generateContent = jest.fn().mockRejectedValue(new Error('503 unavailable'));

    (service as any).ai = {
      models: { generateContent },
    };

    const result = await service.suggestCampaignFormFields({
      prompt: 'Serviço de instalação de ar-condicionado no Rio de Janeiro, leads por WhatsApp, R$ 100/dia.',
      storeId: 'store-generation-error',
    });

    expect(result.name).toContain('Serviços');
    expect(result.budgetSuggestion).toContain('R$ 100');
    expect(result.creativeIdeas).toHaveLength(4);
    expect(generateContent).toHaveBeenCalledTimes(6);
  });
});
