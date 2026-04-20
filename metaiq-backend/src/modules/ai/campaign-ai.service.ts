import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

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

  constructor(private readonly configService: ConfigService) {
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
