import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Store } from '../stores/store.entity';

type CampaignObjective = 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'REACH';
type CampaignDestinationType = 'site' | 'messages' | 'form' | 'app' | 'catalog';
type CampaignGender = 'ALL' | 'MALE' | 'FEMALE';
type CampaignBudgetType = 'daily' | 'lifetime';

interface CampaignAiSuggestions {
  campaignName: string | null;
  objective: CampaignObjective | null;
  budget: number | null;
  budgetType: CampaignBudgetType | null;
  country: string | null;
  region: string | null;
  city: string | null;
  ageMin: number | null;
  ageMax: number | null;
  gender: CampaignGender | null;
  destinationType: CampaignDestinationType | null;
  websiteUrl: string | null;
  message: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  interests: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface CampaignAiSuggestionResponse {
  summary: string;
  detectedFields: string[];
  suggestions: CampaignAiSuggestions;
}

export interface CampaignSuggestionResponse {
  name: string;
  audience: string;
  strategy: string;
  copy: string;
  budgetSuggestion: string;
  creativeIdeas: string[];
}

interface StoreAiContext {
  storeId: string;
  storeName: string;
  companyName: string;
  segment: string;
  description: string;
  targetAudience: string;
  businessType: string;
  managerName: string | null;
  tenantName: string | null;
  contextSources: string[];
}

interface ParsedCampaignSuggestion {
  payload: unknown;
  error?: string;
  truncated?: boolean;
}

@Injectable()
export class CampaignAiService {
  private readonly logger = new Logger(CampaignAiService.name);
  private readonly model: string;
  private readonly apiVersion: string;
  private readonly ai?: GoogleGenAI;
  private readonly defaultModel = 'gemini-2.5-flash';
  private readonly supportedModels = new Set([
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-pro-preview',
  ]);
  private readonly fallbackMap: Record<string, string[]> = {
    'gemini-2.5-flash': ['gemini-2.5-flash-lite', 'gemini-3-pro-preview'],
    'gemini-2.5-flash-lite': ['gemini-2.5-flash', 'gemini-3-pro-preview'],
    'gemini-3-pro-preview': ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  };

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @InjectRepository(Store)
    private readonly storeRepository?: Repository<Store>,
  ) {
    const apiKey = this.readEnv('GEMINI_API_KEY');
    const configuredModel = this.readEnv('GEMINI_MODEL');
    this.apiVersion = this.readEnv('GEMINI_API_VERSION') || 'v1beta';
    this.model = configuredModel && this.supportedModels.has(configuredModel)
      ? configuredModel
      : this.defaultModel;

    if (configuredModel && configuredModel !== this.model) {
      this.logger.warn(
        `Gemini model ${configuredModel} is not in the supported production set. Using ${this.defaultModel} instead.`,
      );
    }

    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured. Campaign AI will be unavailable.');
    }

    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        apiVersion: this.apiVersion,
      });
    }
  }

  async suggestCampaign(prompt: string): Promise<CampaignAiSuggestionResponse> {
    if (!this.ai) {
      throw new InternalServerErrorException('GEMINI_API_KEY não configurada');
    }

    const normalizedPrompt = this.normalizePrompt(prompt);
    if (!normalizedPrompt) {
      throw new UnprocessableEntityException('Prompt inválido para sugestão da campanha');
    }

    let text = '';
    const modelsToTry = [this.model, ...this.getFallbackModels(this.model)].filter(
      (model, index, list) => model && list.indexOf(model) === index,
    );
    let lastError: unknown = null;

    for (let index = 0; index < modelsToTry.length; index += 1) {
      const model = modelsToTry[index];

      try {
        text = await this.generateGeminiText(normalizedPrompt, model);
        break;
      } catch (error) {
        lastError = error;
        const details = this.getErrorDetails(error);
        this.logger.warn(`Gemini request failed for model ${model}: ${details}`);

        if (index < modelsToTry.length - 1) {
          this.logger.log(`Retrying Gemini request with fallback model ${modelsToTry[index + 1]}`);
        }
      }
    }

    if (!text) {
      throw new BadGatewayException({
        message: this.getGeminiErrorMessage(lastError),
        details: this.getErrorDetails(lastError),
      });
    }

    const parsed = this.parseJson(text);
    return this.normalizeResponse(parsed);
  }

  async suggestCampaignFormFields(input: { prompt: string; storeId: string }): Promise<CampaignSuggestionResponse> {
    if (!this.ai) {
      this.logger.warn('GEMINI_API_KEY not configured. Returning safe campaign suggestion fallback.');
      const normalizedPrompt = this.normalizePrompt(input.prompt);
      const storeId = this.asString(input.storeId);
      if (!normalizedPrompt || !storeId) {
        throw new UnprocessableEntityException('Prompt e storeId são obrigatórios para sugestão da campanha');
      }
      return this.buildSafeCampaignSuggestionFallback(normalizedPrompt, {
        storeId,
        storeName: 'Store não identificada',
        companyName: 'Store não identificada',
        segment: this.inferStoreSegment(normalizedPrompt),
        description: 'Contexto da store indisponível; briefing usado como base principal.',
        targetAudience: this.inferTargetAudience(normalizedPrompt, this.inferStoreSegment(normalizedPrompt), 'não informado'),
        businessType: this.inferBusinessType(normalizedPrompt, this.inferStoreSegment(normalizedPrompt)),
        managerName: null,
        tenantName: null,
        contextSources: ['briefing'],
      });
    }

    const normalizedPrompt = this.normalizePrompt(input.prompt);
    const storeId = this.asString(input.storeId);
    if (!normalizedPrompt || !storeId) {
      throw new UnprocessableEntityException('Prompt e storeId são obrigatórios para sugestão da campanha');
    }

    const storeContext = await this.resolveStoreAiContext(storeId, normalizedPrompt);
    const modelsToTry = [this.model, ...this.getFallbackModels(this.model)].filter(
      (model, index, list) => model && list.indexOf(model) === index,
    );
    let lastError: unknown = null;
    let lastInvalidResponse: ParsedCampaignSuggestion | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      for (let index = 0; index < modelsToTry.length; index += 1) {
        const model = modelsToTry[index];

        try {
          const text = await this.generateGeminiCampaignSuggestionText(normalizedPrompt, storeContext, model);
          const parsed = this.parseCampaignSuggestionJson(text);

          if (parsed.payload && this.isValidCampaignSuggestionPayload(parsed.payload)) {
            return this.normalizeCampaignSuggestionResponse(parsed.payload, normalizedPrompt, storeContext);
          }

          lastInvalidResponse = parsed;
          this.logger.warn(
            `Gemini campaign suggestion returned invalid JSON payload on attempt ${attempt}: ${parsed.error || 'unknown format error'}`,
          );
          break;
        } catch (error) {
          lastError = error;
          const details = this.getErrorDetails(error);
          this.logger.warn(`Gemini campaign suggestion failed for model ${model}: ${details}`);

          if (index < modelsToTry.length - 1) {
            this.logger.log(`Retrying Gemini campaign suggestion with fallback model ${modelsToTry[index + 1]}`);
          }
        }
      }

      if (attempt === 1 && lastInvalidResponse) {
        this.logger.log('Retrying Gemini campaign suggestion once because the JSON response was invalid or truncated.');
      }
    }

    if (lastInvalidResponse) {
      this.logger.warn(
        `Returning safe campaign suggestion fallback after invalid Gemini JSON. reason=${lastInvalidResponse.error}; truncated=${!!lastInvalidResponse.truncated}`,
      );
      return this.buildSafeCampaignSuggestionFallback(normalizedPrompt, storeContext);
    }

    if (lastError) {
      this.logger.warn(
        `Returning safe campaign suggestion fallback after Gemini failures: ${this.getGeminiErrorMessage(lastError)}`,
      );
    }

    return this.buildSafeCampaignSuggestionFallback(normalizedPrompt, storeContext);
  }

  private async generateGeminiText(prompt: string, model: string): Promise<string> {
    const response = await this.ai!.models.generateContent({
      model,
      contents: this.buildPrompt(prompt),
      config: {
        temperature: 0.2,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
        responseJsonSchema: this.responseSchema(),
      },
    });

    return (response.text || '').trim();
  }

  private async generateGeminiCampaignSuggestionText(
    prompt: string,
    storeContext: StoreAiContext,
    model: string,
  ): Promise<string> {
    const response = await this.ai!.models.generateContent({
      model,
      contents: this.buildCampaignSuggestionPrompt(prompt, storeContext),
      config: {
        temperature: 0.25,
        maxOutputTokens: 1400,
        responseMimeType: 'application/json',
        responseJsonSchema: this.campaignSuggestionSchema(),
      },
    });

    return (response.text || '').trim();
  }

  private getFallbackModels(model: string): string[] {
    return this.fallbackMap[model] ?? this.fallbackMap[this.defaultModel];
  }

  private readEnv(key: string): string {
    return (
      this.configService.get<string>(key)
      || this.configService.get<string>(`app.${key}`)
      || process.env[key]
      || ''
    ).trim();
  }

  private buildStoreAiContextFromMetadata(input: {
    storeId: string;
    prompt: string;
    storeName?: string | null;
    managerName?: string | null;
    tenantName?: string | null;
    managerNotes?: string | null;
    tenantNotes?: string | null;
  }): StoreAiContext {
    const storeName = this.asString(input.storeName) || 'Store não identificada';
    const managerName = this.asString(input.managerName) || null;
    const tenantName = this.asString(input.tenantName) || null;
    const managerNotes = this.asString(input.managerNotes);
    const tenantNotes = this.asString(input.tenantNotes);
    const sourceText = [
      input.prompt,
      storeName,
      managerName,
      tenantName,
      tenantNotes,
      managerNotes,
    ].filter(Boolean).join('\n');
    const companyName = this.firstSpecificText(storeName, tenantName, managerName) || 'Store não identificada';
    const segment = this.inferStoreSegment(sourceText);
    const businessType = this.inferBusinessType(sourceText, segment);
    const description = this.firstSpecificText(tenantNotes, managerNotes)
      || `Empresa ${companyName} no segmento ${segment}, com operação de ${businessType}.`;
    const targetAudience = this.inferTargetAudience(sourceText, segment, businessType);
    const contextSources = [
      this.asString(input.storeName) ? 'store.name' : '',
      tenantName ? 'tenant.name' : '',
      managerName ? 'manager.name' : '',
      tenantNotes ? 'tenant.notes' : '',
      managerNotes ? 'manager.notes' : '',
      input.prompt ? 'briefing' : '',
    ].filter(Boolean);

    return {
      storeId: input.storeId,
      storeName,
      companyName,
      segment,
      description,
      targetAudience,
      businessType,
      managerName,
      tenantName,
      contextSources,
    };
  }

  private async resolveStoreAiContext(storeId: string, prompt: string): Promise<StoreAiContext> {
    const fallback = this.buildStoreAiContextFromMetadata({
      storeId,
      prompt,
      storeName: 'Store não identificada',
    });

    if (!this.storeRepository) {
      return fallback;
    }

    try {
      const store = await this.storeRepository.findOne({
        where: { id: storeId, deletedAt: IsNull() },
        relations: ['manager', 'tenant'],
      });

      if (!store) {
        return fallback;
      }

      return {
        ...this.buildStoreAiContextFromMetadata({
          storeId,
          prompt,
          storeName: store.name,
          managerName: store.manager?.name || null,
          tenantName: store.tenant?.name || null,
          managerNotes: store.manager?.notes || null,
          tenantNotes: store.tenant?.notes || null,
        }),
      };
    } catch (error) {
      this.logger.warn(`Unable to load store AI context for ${storeId}: ${this.getErrorDetails(error)}`);
      return fallback;
    }
  }

  private firstSpecificText(...values: Array<string | null | undefined>): string {
    return values
      .map((value) => this.asString(value))
      .find((value) => !!value && !/^store n[aã]o identificada$/i.test(value) && !/^n[aã]o informado$/i.test(value))
      || '';
  }

  private normalizePrompt(prompt: string): string {
    return (prompt || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 4000);
  }

  private getErrorDetails(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const candidate = error as {
        message?: unknown;
        status?: unknown;
        code?: unknown;
        details?: unknown;
        error?: unknown;
      };
      const extracted = {
        message: typeof candidate.message === 'string' ? candidate.message : undefined,
        status: candidate.status,
        code: candidate.code,
        details: candidate.details,
        error: candidate.error,
      };

      try {
        return JSON.stringify(extracted);
      } catch {
        return extracted.message || 'Falha desconhecida';
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Falha desconhecida';
  }

  private getGeminiErrorMessage(error: unknown): string {
    const details = String(this.getErrorDetails(error)).toLowerCase();

    if (details.includes('resource_exhausted') || details.includes('quota exceeded')) {
      return 'Quota do Gemini esgotada. Verifique billing ou tente novamente mais tarde.';
    }

    if (details.includes('api key expired') || details.includes('api key not valid') || details.includes('invalid api key') || details.includes('unauthorized') || details.includes('permission_denied')) {
      return 'Chave Gemini inválida ou expirada. Verifique a configuração da API.';
    }

    if (details.includes('not_found') || (details.includes('model') && details.includes('not found'))) {
      return 'O modelo Gemini configurado não é suportado. Verifique a configuração de modelo.';
    }

    if (details.includes('429') || details.includes('too many requests') || details.includes('rate limit')) {
      return 'Limite de requisições do Gemini atingido. Tente novamente mais tarde.';
    }

    if (details.includes('deadline exceeded') || details.includes('timed out') || details.includes('timeout')) {
      return 'A IA demorou mais do que o esperado para responder. Tente novamente.';
    }

    if (details.includes('503') || details.includes('unavailable')) {
      return 'O serviço do Gemini está indisponível no momento. Tente novamente em instantes.';
    }

    return 'Erro ao consultar Gemini';
  }

  private buildPrompt(prompt: string): string {
    return `
Você é um especialista em Meta Ads.

Sua tarefa é transformar um briefing em JSON estruturado.

Responda APENAS JSON válido.
NUNCA use markdown.
NUNCA explique nada.

Enums permitidos:

objective:
- OUTCOME_TRAFFIC
- OUTCOME_LEADS
- REACH

destinationType:
- site
- messages
- form
- app
- catalog

gender:
- ALL
- MALE
- FEMALE

budgetType:
- daily
- lifetime

Formato obrigatório:

{
  "summary": "string",
  "detectedFields": ["string"],
  "suggestions": {
    "campaignName": "string | null",
    "objective": "string | null",
    "budget": number | null,
    "budgetType": "string | null",
    "country": "string | null",
    "region": "string | null",
    "city": "string | null",
    "ageMin": number | null,
    "ageMax": number | null,
    "gender": "string | null",
    "destinationType": "string | null",
    "websiteUrl": "string | null",
    "message": "string | null",
    "headline": "string | null",
    "description": "string | null",
    "cta": "string | null",
    "interests": "string | null",
    "utmSource": "string | null",
    "utmMedium": "string | null",
    "utmCampaign": "string | null"
  }
}

Regras:
- Se mencionar WhatsApp, Direct, Messenger ou conversar, destinationType = messages
- Se mencionar leads, cadastro ou formulário, objective = OUTCOME_LEADS
- Se mencionar tráfego, visitas ou cliques, objective = OUTCOME_TRAFFIC
- Se mencionar alcance, awareness ou reconhecimento, objective = REACH
- Se não souber algum campo, usar null
- country deve ser ISO-2 maiúsculo quando existir
- region deve ser o estado/região por extenso quando existir
- city deve ser a cidade principal quando existir
- Se o briefing mencionar "SP capital", "São Paulo capital" ou "capital paulista", use city = "São Paulo" e region = "São Paulo"
- budget deve ser número simples
- detectedFields deve listar apenas os campos que você realmente inferiu

Briefing:
${prompt}
    `.trim();
  }

  private buildCampaignSuggestionPrompt(prompt: string, storeContext: StoreAiContext): string {
    return `
Você é um estrategista sênior de Meta Ads para ecommerce, infoprodutos e negócios locais no Brasil.

Transforme o briefing em uma sugestão prática, específica e imediatamente editável para criação de campanha.

Responda APENAS JSON válido.
NUNCA use markdown.
NUNCA explique fora do JSON.

Formato obrigatório:
{
  "name": "string",
  "audience": "string",
  "strategy": "string",
  "copy": "string",
  "budgetSuggestion": "string",
  "creativeIdeas": ["string"]
}

Regras:
- name deve ter até 80 caracteres, citar nicho/oferta/objetivo e evitar nomes genéricos como "Campanha gerada com IA".
- audience deve ter até 260 caracteres e citar persona/cargo quando fizer sentido, intenção de compra, dor, localização quando existir, idade quando fizer sentido e 3 a 6 interesses/comportamentos.
- strategy deve ter até 280 caracteres e citar objetivo Meta provável, etapa de funil, canal/destino, CTA e uma hipótese de otimização.
- copy deve ter até 260 caracteres, em português do Brasil, com dor explícita do cliente, benefício claro, prova/gancho e CTA direto.
- budgetSuggestion deve ter até 180 caracteres e preservar o valor do briefing. Se não houver valor, sugerir faixa inicial realista em BRL e explicar cadência diária ou total.
- creativeIdeas deve ter exatamente 4 ideias objetivas; cada item deve ter até 120 caracteres com formato + conceito + elemento visual/textual.
- Use o contexto da store para ajustar tom e nome quando ele ajudar, mas nunca invente produtos, preços, promessas médicas ou garantias.
- É proibido usar termos genéricos isolados como "negócio", "produto", "serviço", "solução" ou "oferta" quando houver segmento/descrição disponível. Troque por termos do nicho, exemplo: "creatina", "banho e tosa", "apartamento", "aula gratuita", "instalação de ar-condicionado".
- name, audience, strategy, copy e creativeIdeas devem mencionar o segmento ou uma palavra específica do nicho.
- Para suplementos, não prometa cura, emagrecimento garantido ou resultado médico.
- Para leads e serviços, priorize qualificação do lead, dor explícita e próximo passo.
- Para infoprodutos, priorize promessa educacional realista, transformação desejada e prova sem exagero.
- Se um dado essencial faltar, faça uma suposição conservadora e deixe explícito como hipótese editável.
- Não inclua o storeId na resposta.

Contexto real/derivado da store:
- Empresa: ${storeContext.companyName}
- Segmento: ${storeContext.segment}
- Descrição: ${storeContext.description}
- Público-alvo base: ${storeContext.targetAudience}
- Tipo de negócio: ${storeContext.businessType}
- Fontes usadas: ${storeContext.contextSources.join(', ') || 'briefing'}
- Store: ${storeContext.storeName}
- Manager: ${storeContext.managerName || 'não informado'}
- Tenant: ${storeContext.tenantName || 'não informado'}

Briefing:
${prompt}
    `.trim();
  }

  private responseSchema(): unknown {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'detectedFields', 'suggestions'],
      properties: {
        summary: { type: 'string' },
        detectedFields: {
          type: 'array',
          items: { type: 'string' },
        },
        suggestions: {
          type: 'object',
          additionalProperties: false,
          properties: {
            campaignName: { type: ['string', 'null'] },
            objective: { type: ['string', 'null'] },
            budget: { type: ['number', 'null'] },
            budgetType: { type: ['string', 'null'] },
            country: { type: ['string', 'null'] },
            region: { type: ['string', 'null'] },
            city: { type: ['string', 'null'] },
            ageMin: { type: ['number', 'null'] },
            ageMax: { type: ['number', 'null'] },
            gender: { type: ['string', 'null'] },
            destinationType: { type: ['string', 'null'] },
            websiteUrl: { type: ['string', 'null'] },
            message: { type: ['string', 'null'] },
            headline: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            cta: { type: ['string', 'null'] },
            interests: { type: ['string', 'null'] },
            utmSource: { type: ['string', 'null'] },
            utmMedium: { type: ['string', 'null'] },
            utmCampaign: { type: ['string', 'null'] },
          },
        },
      },
    };
  }

  private campaignSuggestionSchema(): unknown {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'audience', 'strategy', 'copy', 'budgetSuggestion', 'creativeIdeas'],
      properties: {
        name: { type: 'string', minLength: 1 },
        audience: { type: 'string', minLength: 1 },
        strategy: { type: 'string', minLength: 1 },
        copy: { type: 'string', minLength: 1 },
        budgetSuggestion: { type: 'string', minLength: 1 },
        creativeIdeas: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          items: { type: 'string', minLength: 1 },
        },
      },
    };
  }

  private parseJson(raw: string): unknown {
    const sanitized = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(sanitized);
    } catch {
      throw new UnprocessableEntityException({
        message: 'Resposta inválida da IA',
        raw: sanitized,
      });
    }
  }

  private normalizeResponse(payload: any): CampaignAiSuggestionResponse {
    const suggestions = payload?.suggestions ?? {};

    return {
      summary: this.asString(payload?.summary) || 'Sugestões geradas pela IA.',
      detectedFields: Array.isArray(payload?.detectedFields)
        ? payload.detectedFields.map((item: unknown) => this.asString(item)).filter(Boolean) as string[]
        : [],
      suggestions: {
        campaignName: this.asNullableString(suggestions.campaignName),
        objective: this.isObjective(suggestions.objective) ? suggestions.objective : null,
        budget: this.asNullableNumber(suggestions.budget),
        budgetType: this.isBudgetType(suggestions.budgetType) ? suggestions.budgetType : null,
        country: this.normalizeCountry(suggestions.country),
        region: this.normalizeLocationLabel(suggestions.region),
        city: this.normalizeLocationLabel(suggestions.city),
        ageMin: this.asNullableInteger(suggestions.ageMin),
        ageMax: this.asNullableInteger(suggestions.ageMax),
        gender: this.isGender(suggestions.gender) ? suggestions.gender : null,
        destinationType: this.isDestinationType(suggestions.destinationType) ? suggestions.destinationType : null,
        websiteUrl: this.isHttpUrl(suggestions.websiteUrl) ? suggestions.websiteUrl.trim() : null,
        message: this.asNullableString(suggestions.message),
        headline: this.asNullableString(suggestions.headline),
        description: this.asNullableString(suggestions.description),
        cta: this.asNullableString(suggestions.cta),
        interests: this.asNullableString(suggestions.interests),
        utmSource: this.asNullableString(suggestions.utmSource),
        utmMedium: this.asNullableString(suggestions.utmMedium),
        utmCampaign: this.asNullableString(suggestions.utmCampaign),
      },
    };
  }

  private normalizeCampaignSuggestionResponse(
    payload: any,
    prompt = '',
    storeContext?: StoreAiContext,
  ): CampaignSuggestionResponse {
    const vertical = this.inferVertical([
      prompt,
      storeContext?.segment,
      storeContext?.description,
      storeContext?.businessType,
    ].filter(Boolean).join(' '));
    const segment = this.firstSpecificText(storeContext?.segment) || vertical;
    const storeName = storeContext?.companyName && storeContext.companyName !== 'Store não identificada'
      ? storeContext.companyName
      : '';
    const creativeIdeas = Array.isArray(payload?.creativeIdeas)
      ? payload.creativeIdeas
          .map((item: unknown) => this.asString(item))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const name = this.asString(payload?.name);
    const audience = this.asString(payload?.audience);
    const strategy = this.asString(payload?.strategy);
    const copy = this.asString(payload?.copy);
    const budgetSuggestion = this.asString(payload?.budgetSuggestion);

    return {
      name: this.isGenericText(name)
        ? this.buildFallbackCampaignName(segment, storeName, prompt)
        : name.slice(0, 80),
      audience: this.isGenericText(audience)
        ? this.buildFallbackAudience(segment, storeContext)
        : audience,
      strategy: this.isGenericText(strategy)
        ? this.buildFallbackStrategy(segment, storeContext)
        : strategy,
      copy: this.isGenericText(copy)
        ? this.buildFallbackCopy(segment, storeContext)
        : copy,
      budgetSuggestion: this.isGenericText(budgetSuggestion)
        ? this.buildFallbackBudget(prompt)
        : budgetSuggestion,
      creativeIdeas: creativeIdeas.length === 4
        ? creativeIdeas
        : this.buildFallbackCreativeIdeas(segment, creativeIdeas, storeContext),
    };
  }

  private parseCampaignSuggestionJson(raw: string): ParsedCampaignSuggestion {
    const sanitized = this.sanitizeJson(raw);
    const truncated = this.looksTruncatedJson(sanitized);

    if (!sanitized) {
      return { payload: null, error: 'empty_response', truncated };
    }

    if (truncated) {
      return { payload: null, error: 'truncated_json', truncated };
    }

    try {
      const payload = JSON.parse(sanitized);
      const validationError = this.getCampaignSuggestionValidationError(payload);
      if (validationError) {
        return { payload, error: validationError, truncated: false };
      }

      return { payload, truncated: false };
    } catch {
      return { payload: null, error: 'invalid_json', truncated };
    }
  }

  private sanitizeJson(raw: string): string {
    return (raw || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  private looksTruncatedJson(raw: string): boolean {
    if (!raw) return false;
    if (!raw.startsWith('{')) return false;
    if (!raw.endsWith('}')) return true;

    const quotes = raw.match(/(?<!\\)"/g)?.length || 0;
    return quotes % 2 !== 0;
  }

  private isValidCampaignSuggestionPayload(payload: unknown): payload is CampaignSuggestionResponse {
    return !this.getCampaignSuggestionValidationError(payload);
  }

  private getCampaignSuggestionValidationError(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return 'payload_not_object';
    }

    const candidate = payload as Record<string, unknown>;
    const requiredStringFields = ['name', 'audience', 'strategy', 'copy', 'budgetSuggestion'];
    const missingField = requiredStringFields.find((field) => !this.asString(candidate[field]));
    if (missingField) {
      return `missing_or_empty_${missingField}`;
    }

    if (!Array.isArray(candidate.creativeIdeas)) {
      return 'missing_or_invalid_creativeIdeas';
    }

    const ideas = candidate.creativeIdeas.map((item) => this.asString(item)).filter(Boolean);
    if (ideas.length < 4) {
      return 'creativeIdeas_less_than_4';
    }

    return null;
  }

  private buildSafeCampaignSuggestionFallback(
    prompt: string,
    storeContext?: StoreAiContext,
  ): CampaignSuggestionResponse {
    return this.normalizeCampaignSuggestionResponse({}, prompt, storeContext);
  }

  private inferStoreSegment(text: string): string {
    const normalized = text.toLowerCase();
    if (/(moda feminina|vestido|look|roupa|fashion|calçado|calcado|acess[oó]rio)/i.test(normalized)) return 'moda feminina';
    if (/(suplement|whey|creatina|vitamina|pré-treino|pre treino|academia|muscula[cç][aã]o)/i.test(normalized)) return 'suplementos fitness';
    if (/(pet shop|pet|cachorro|gato|ração|racao|banho e tosa|veterin[aá]r)/i.test(normalized)) return 'pet shop';
    if (/(eletr[oô]nico|celular|smartphone|notebook|fone|gadget|carregador|bluetooth)/i.test(normalized)) return 'eletrônicos e acessórios';
    if (/(im[oó]vel|apartamento|casa|alto padr[aã]o|empreendimento|condom[ií]nio|corretor|imobili[aá]ri)/i.test(normalized)) return 'imóveis e lançamentos imobiliários';
    if (/(curso|mentoria|aula|infoproduto|webinar|ebook|treinamento|ingl[eê]s)/i.test(normalized)) return 'educação online e infoprodutos';
    if (/(saas|software|plataforma|crm|erp|assinatura|b2b)/i.test(normalized)) return 'SaaS B2B';
    if (/(consultoria financeira|fluxo de caixa|gest[aã]o financeira|contabilidade|advocacia|cl[ií]nica|diagn[oó]stico)/i.test(normalized)) return 'serviços profissionais';
    if (/(ar-condicionado|ar condicionado|instala[cç][aã]o|manuten[cç][aã]o|reforma|assist[eê]ncia)/i.test(normalized)) return 'serviços locais residenciais';
    if (/(lead|leads|or[cç]amento|agendar|whatsapp|direct|formul[aá]rio)/i.test(normalized)) return 'geração de leads';
    return 'campanha comercial';
  }

  private inferBusinessType(text: string, segment: string): string {
    const normalized = `${text} ${segment}`.toLowerCase();
    if (/(e-?commerce|loja online|compre online|carrinho|checkout|cat[aá]logo)/i.test(normalized)) return 'e-commerce';
    if (/(saas|software|plataforma|assinatura|crm|erp|b2b)/i.test(normalized)) return 'SaaS';
    if (/(curso|mentoria|aula|infoproduto|webinar|ebook|treinamento)/i.test(normalized)) return 'infoproduto';
    if (/(lead|leads|formul[aá]rio|diagn[oó]stico|consultoria|im[oó]vel|apartamento|or[cç]amento)/i.test(normalized)) return 'geração de leads';
    if (/(servi[cç]o|instala[cç][aã]o|manuten[cç][aã]o|banho e tosa|cl[ií]nica|advocacia|contabilidade)/i.test(normalized)) return 'serviço local';
    if (/(moda|suplementos|pet shop|eletr[oô]nicos)/i.test(normalized)) return 'e-commerce';
    return 'operação comercial';
  }

  private inferTargetAudience(text: string, segment: string, businessType: string): string {
    const normalized = `${text} ${segment} ${businessType}`.toLowerCase();
    if (/suplement|whey|creatina|academia|muscula[cç][aã]o/i.test(normalized)) {
      return 'Praticantes de musculação e treino funcional, 20 a 40 anos, interessados em performance, rotina de treino, compra recorrente e comparação de suplementos.';
    }
    if (/pet|banho e tosa|ração|racao/i.test(normalized)) {
      return 'Tutores de cães e gatos, 25 a 55 anos, que buscam cuidado confiável, conveniência para agendar e serviços próximos da rotina.';
    }
    if (/im[oó]vel|apartamento|alto padr[aã]o|imobili/i.test(normalized)) {
      return 'Compradores e investidores de imóveis, 30 a 60 anos, com interesse em localização, segurança patrimonial, status e atendimento consultivo.';
    }
    if (/saas|software|b2b|plataforma/i.test(normalized)) {
      return 'Gestores, coordenadores e decisores B2B que sentem perda de produtividade, buscam previsibilidade operacional e comparam ferramentas.';
    }
    if (/consultoria financeira|fluxo de caixa|gest[aã]o financeira/i.test(normalized)) {
      return 'Donos, sócios e gestores financeiros de pequenas empresas, com dor em fluxo de caixa, margem, controle e tomada de decisão.';
    }
    if (/curso|mentoria|aula|infoproduto|ingl[eê]s/i.test(normalized)) {
      return 'Adultos interessados em desenvolvimento profissional, com dor de falta de método, pouco tempo para estudar e desejo de evolução prática.';
    }
    if (/ar-condicionado|instala[cç][aã]o|manuten[cç][aã]o|servi[cç]os locais/i.test(normalized)) {
      return 'Moradores e pequenos negócios que precisam resolver instalação ou manutenção com rapidez, confiança, orçamento claro e atendimento local.';
    }
    if (/moda|vestido|roupa|look/i.test(normalized)) {
      return 'Mulheres com intenção de compra em moda, interessadas em estilo, conforto, ocasião de uso, tendências e atendimento consultivo.';
    }
    return 'Pessoas com intenção clara de compra ou contratação, com dor ligada ao segmento, interesse ativo e disposição para conversar ou comparar opções.';
  }

  private inferVertical(prompt: string): string {
    const normalized = prompt.toLowerCase();
    if (/(moda|roupa|vestido|look|fashion)/i.test(normalized)) return 'moda';
    if (/(suplement|whey|creatina|vitamina|pré-treino|pre treino)/i.test(normalized)) return 'suplementos';
    if (/(pet|cachorro|gato|ração|banho e tosa)/i.test(normalized)) return 'pet';
    if (/(eletr[oô]nico|celular|smartphone|notebook|fone|gadget)/i.test(normalized)) return 'eletrônicos';
    if (/(curso|mentoria|aula|infoproduto|webinar|ebook)/i.test(normalized)) return 'infoproduto';
    if (/(servi[cç]o|cl[ií]nica|advocacia|contabilidade|reforma|instalação)/i.test(normalized)) return 'serviços';
    if (/(lead|leads|orçamento|consultoria|diagnóstico|agendar)/i.test(normalized)) return 'leads';
    return 'negócio';
  }

  private isGenericText(value: string): boolean {
    const normalized = value.toLowerCase().trim();
    if (!normalized) return true;
    return [
      'campanha gerada com ia',
      'público amplo com segmentação conservadora.',
      'publico amplo com segmentacao conservadora.',
      'conheça a solução e fale com nosso time para saber mais.',
      'conheca a solucao e fale com nosso time para saber mais.',
      'conheça nosso produto e fale com nosso time.',
      'conheca nosso produto e fale com nosso time.',
      'comece com orçamento diário moderado e ajuste conforme os primeiros resultados.',
      'comece com orcamento diario moderado e ajuste conforme os primeiros resultados.',
    ].includes(normalized);
  }

  private buildFallbackCampaignName(vertical: string, storeName: string, prompt = ''): string {
    const prefix = storeName ? `${storeName} | ` : '';
    const objective = /lead|leads|formul[aá]rio|whatsapp|direct|agendar|or[cç]amento/i.test(prompt)
      ? 'Leads'
      : 'Aquisição';
    return `${prefix}${objective} | ${this.toTitle(vertical)} | Meta`.slice(0, 80);
  }

  private buildFallbackAudience(segment: string, storeContext?: StoreAiContext): string {
    const baseAudience = this.firstSpecificText(storeContext?.targetAudience);
    if (baseAudience) {
      return `${baseAudience} Segmentar por interesse ativo em ${segment}, engajamento recente e captação de leads qualificados.`;
    }

    return `Pessoas com intenção de compra em ${segment}, 24 a 44 anos, no Brasil, combinando interesses do nicho, engajamento recente e captação de leads qualificados.`;
  }

  private buildFallbackStrategy(segment: string, storeContext?: StoreAiContext): string {
    const businessType = this.firstSpecificText(storeContext?.businessType) || 'operação comercial';
    return `Campanha de conversão/leads para ${segment} em modelo ${businessType}, começando por público frio qualificado e remarketing leve, com CTA direto e otimização por intenção real.`;
  }

  private buildFallbackCopy(segment: string, storeContext?: StoreAiContext): string {
    const pain = this.inferPain(segment, storeContext?.businessType || '');
    const benefit = this.inferBenefit(segment, storeContext?.businessType || '');
    const cta = /lead|servi[cç]o|im[oó]ve|consultoria|instala/i.test(`${segment} ${storeContext?.businessType || ''}`)
      ? 'Solicite atendimento agora.'
      : 'Veja as opções e compre com segurança.';

    return `Cansado de ${pain}? ${benefit} para quem busca ${segment} com clareza e confiança. ${cta}`;
  }

  private buildFallbackBudget(prompt: string): string {
    const budgetMatch = prompt.match(/r\$\s*(\d{2,6}(?:[.,]\d{1,2})?)|(?:orçamento|orcamento|budget|investimento)\s*(?:de|em)?\s*(\d{2,6}(?:[.,]\d{1,2})?)/i);
    const value = budgetMatch?.[1] || budgetMatch?.[2];
    if (value) {
      return `Usar R$ ${value.replace('.', ',')} como orçamento ${/total|vital[ií]cio|campanha inteira/i.test(prompt) ? 'total da campanha' : 'diário'}, revisando CPL/CPA após 3 dias.`;
    }

    return 'Iniciar com R$ 80 a R$ 150 por dia por conjunto, revisar sinais após 72 horas e escalar apenas criativos com CTR e custo por resultado saudáveis.';
  }

  private buildFallbackCreativeIdeas(segment: string, existing: string[], storeContext?: StoreAiContext): string[] {
    const businessType = this.firstSpecificText(storeContext?.businessType) || 'campanha';
    return [
      ...existing,
      `Vídeo curto: dor comum em ${segment} + benefício claro nos 3 primeiros segundos`,
      `Imagem estática: destaque de ${segment} + prova visual e CTA direto`,
      `Carrossel: 3 critérios para escolher ${segment} + CTA no último card`,
      `Depoimento ou bastidor: confiança em ${businessType} + chamada para conversa`,
    ].slice(0, 4);
  }

  private inferPain(segment: string, businessType: string): string {
    const normalized = `${segment} ${businessType}`.toLowerCase();
    if (/suplement/i.test(normalized)) return 'perder tempo comparando suplementos sem saber o que encaixa no seu treino';
    if (/pet/i.test(normalized)) return 'adiar o cuidado do seu pet por falta de horário e confiança';
    if (/im[oó]vel|apartamento/i.test(normalized)) return 'receber opções de imóvel que não combinam com seu perfil';
    if (/saas|software/i.test(normalized)) return 'processos manuais que travam a produtividade do time';
    if (/consultoria financeira/i.test(normalized)) return 'decidir com caixa desorganizado e pouca previsibilidade';
    if (/curso|educa[cç][aã]o|infoproduto|ingl[eê]s/i.test(normalized)) return 'estudar sem método e abandonar antes de evoluir';
    if (/ar-condicionado|instala/i.test(normalized)) return 'ficar sem conforto por falta de instalação rápida e confiável';
    if (/moda/i.test(normalized)) return 'comprar uma peça que não combina com sua ocasião';
    return 'perder tempo com opções pouco claras';
  }

  private inferBenefit(segment: string, businessType: string): string {
    const normalized = `${segment} ${businessType}`.toLowerCase();
    if (/suplement/i.test(normalized)) return 'Compare creatina, whey e opções de rotina fitness';
    if (/pet/i.test(normalized)) return 'Agende cuidado pet com praticidade e atendimento próximo';
    if (/im[oó]vel|apartamento/i.test(normalized)) return 'Receba uma curadoria de imóveis alinhada ao seu perfil';
    if (/saas|software/i.test(normalized)) return 'Veja como organizar o fluxo do time com mais previsibilidade';
    if (/consultoria financeira/i.test(normalized)) return 'Mapeie gargalos financeiros antes de tomar novas decisões';
    if (/curso|educa[cç][aã]o|infoproduto|ingl[eê]s/i.test(normalized)) return 'Comece com uma trilha prática e possível para sua rotina';
    if (/ar-condicionado|instala/i.test(normalized)) return 'Receba orientação para instalar ou manter seu ar-condicionado';
    if (/moda/i.test(normalized)) return 'Encontre peças com estilo, conforto e contexto de uso';
    return 'Compare alternativas com mais segurança';
  }

  private toTitle(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private asNullableString(value: unknown): string | null {
    const normalized = this.asString(value);
    return normalized || null;
  }

  private asNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 ? value : null;
    }

    if (typeof value === 'string') {
      const normalized = Number(value.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
    }

    return null;
  }

  private asNullableInteger(value: unknown): number | null {
    const normalized = this.asNullableNumber(value);
    return normalized !== null ? Math.round(normalized) : null;
  }

  private isObjective(val: unknown): val is CampaignObjective {
    return ['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'REACH'].includes(String(val));
  }

  private isCountry(val: unknown): val is string {
    return /^[A-Z]{2}$/.test(String(val || '').trim());
  }

  private normalizeCountry(val: unknown): string | null {
    const normalized = this.asString(val).toUpperCase();
    return this.isCountry(normalized) ? normalized : null;
  }

  private normalizeLocationLabel(val: unknown): string | null {
    const normalized = this.asString(val);
    return normalized.length >= 2 ? normalized : null;
  }

  private isGender(val: unknown): val is CampaignGender {
    return ['ALL', 'MALE', 'FEMALE'].includes(String(val));
  }

  private isBudgetType(val: unknown): val is CampaignBudgetType {
    return ['daily', 'lifetime'].includes(String(val));
  }

  private isDestinationType(val: unknown): val is CampaignDestinationType {
    return ['site', 'messages', 'form', 'app', 'catalog'].includes(String(val));
  }

  private isHttpUrl(val: unknown): val is string {
    const text = this.asString(val);
    if (!text) return false;

    try {
      const url = new URL(text);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }
}
