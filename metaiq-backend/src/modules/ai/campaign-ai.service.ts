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
import { AuthenticatedUser } from '../../common/interfaces';
import { AccessScopeService } from '../../common/services/access-scope.service';
import { LoggerService } from '../../common/services/logger.service';
import { IntegrationProvider, IntegrationStatus } from '../../common/enums';
import { StoreIntegration } from '../integrations/store-integration.entity';
import { Store } from '../stores/store.entity';
import {
  AiAdSetOutput,
  AiCampaignBudgetOutput,
  AiCampaignCopilotAnalysis,
  AiCampaignCopilotImprovement,
  AiCampaignCopilotImprovementType,
  AiCampaignObjective,
  AiCampaignOutput,
  AiCreativeOutput,
  AiFunnelStage,
  AiGenderOutput,
  AiPlacement,
  AiPlannerOutput,
  AiReviewOutput,
  AiValidationOutput,
  CampaignCopilotAnalysisRequest,
  CampaignCopilotAnalysisResponse,
  CampaignAiRequest,
  CampaignAiStructuredResponse,
} from './dto/campaign-ai.dto';

type CampaignObjective = AiCampaignObjective;
type CampaignGender = 'ALL' | 'MALE' | 'FEMALE';
type CampaignBudgetType = 'daily' | 'lifetime';
type CampaignDestinationType = 'messages' | 'site';
type CampaignRecommendationBasis = 'business_context_only' | 'business_context_with_operational_signals' | 'fallback_business_context';

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

type AiConfidence = 'low' | 'medium' | 'high';

export type CampaignSuggestionResponse = CampaignAiStructuredResponse;
export type CampaignAnalysisResponse = CampaignCopilotAnalysisResponse;

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
  storeProfile: {
    name: string;
    segment: string;
    businessType: string;
    city: string | null;
    region: string | null;
    salesModel: 'local' | 'ecommerce' | 'hybrid' | 'unknown';
    mainOffer: string | null;
    targetAudienceBase: string;
    differentiators: string[];
    notesSummary: string;
  };
  campaignIntent: {
    goal: string | null;
    funnelStage: string | null;
    channelPreference: string | null;
    budgetRange: string | null;
    durationDays: number | null;
    destinationType: string | null;
    primaryOffer: string | null;
    region: string | null;
    extraContext: string | null;
  };
  dataAvailability: {
    hasHistoricalCampaigns: false;
    hasPerformanceMetrics: false;
    hasConnectedMetaAccount: boolean;
    hasConnectedPage: boolean;
  };
}

interface ParsedCampaignSuggestion {
  payload: unknown;
  error?: string;
  truncated?: boolean;
}

@Injectable()
export class CampaignAiService {
  private readonly logger = new Logger(CampaignAiService.name);
  private readonly aiFeature = 'campaign_suggestions';
  private readonly promptVersion = 'campaign-structured-v3.0.0';
  private readonly analysisPromptVersion = 'campaign-copilot-v1.0.0';
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
    @Optional()
    @InjectRepository(StoreIntegration)
    private readonly integrationRepository?: Repository<StoreIntegration>,
    @Optional()
    private readonly accessScope?: AccessScopeService,
    @Optional()
    private readonly structuredLogger?: LoggerService,
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

  async suggestCampaignFormFields(
    input: CampaignAiRequest,
    requester?: AuthenticatedUser,
  ): Promise<CampaignSuggestionResponse> {
    const startedAt = Date.now();
    const requestId = this.asString(input.requestId) || undefined;

    if (!this.ai) {
      this.logger.warn('GEMINI_API_KEY not configured. Returning safe campaign suggestion fallback.');
      const normalizedPrompt = this.normalizePrompt(input.prompt);
      const storeId = this.asString(input.storeId);
      if (!normalizedPrompt || !storeId) {
        throw new UnprocessableEntityException('Prompt e storeId são obrigatórios para sugestão da campanha');
      }
      await this.validateStoreScopeIfPossible(storeId, requester);
      const fallback = this.buildSafeCampaignSuggestionFallback(normalizedPrompt, this.buildStoreAiContextFromMetadata({
        storeId,
        prompt: normalizedPrompt,
        input,
        storeName: 'Store não identificada',
      }), { model: this.model, usedFallback: true, responseValid: true });
      this.logAiEvent('Campaign AI fallback returned because API key is missing', {
        requestId,
        storeId,
        durationMs: Date.now() - startedAt,
        model: this.model,
        usedFallback: true,
        responseValid: true,
        failureReason: 'missing_api_key',
      });
      return fallback;
    }

    const normalizedPrompt = this.normalizePrompt(input.prompt);
    const storeId = this.asString(input.storeId);
    if (!normalizedPrompt || !storeId) {
      throw new UnprocessableEntityException('Prompt e storeId são obrigatórios para sugestão da campanha');
    }

    await this.validateStoreScopeIfPossible(storeId, requester);
    const storeContext = await this.resolveStoreAiContext(storeId, normalizedPrompt, input);
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
            const response = this.normalizeCampaignSuggestionResponse(
              parsed.payload,
              normalizedPrompt,
              storeContext,
              { model, usedFallback: false, responseValid: true },
            );
            this.logAiEvent('Campaign AI suggestion generated', {
              requestId,
              storeId,
              durationMs: Date.now() - startedAt,
              model,
              usedFallback: false,
              responseValid: true,
            });
            return response;
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
      const fallback = this.buildSafeCampaignSuggestionFallback(normalizedPrompt, storeContext, {
        model: this.model,
        usedFallback: true,
        responseValid: false,
      });
      this.logAiEvent('Campaign AI fallback returned after invalid model response', {
        requestId,
        storeId,
        durationMs: Date.now() - startedAt,
        model: this.model,
        usedFallback: true,
        responseValid: false,
        failureReason: lastInvalidResponse.error || 'invalid_model_response',
      });
      return fallback;
    }

    if (lastError) {
      this.logger.warn(
        `Returning safe campaign suggestion fallback after Gemini failures: ${this.getGeminiErrorMessage(lastError)}`,
      );
    }

    const fallback = this.buildSafeCampaignSuggestionFallback(normalizedPrompt, storeContext, {
      model: this.model,
      usedFallback: true,
      responseValid: !lastError,
    });
    this.logAiEvent('Campaign AI fallback returned', {
      requestId,
      storeId,
      durationMs: Date.now() - startedAt,
      model: this.model,
      usedFallback: true,
      responseValid: !lastError,
      failureReason: lastError ? this.getGeminiErrorMessage(lastError) : undefined,
    });
    return fallback;
  }

  async analyzeCampaign(
    input: CampaignCopilotAnalysisRequest,
    requester?: AuthenticatedUser,
  ): Promise<CampaignAnalysisResponse> {
    const startedAt = Date.now();
    const requestId = this.asString(input.requestId) || undefined;
    const storeId = this.asString(input.storeId);

    if (!storeId || !input.campaign || typeof input.campaign !== 'object') {
      throw new UnprocessableEntityException('storeId e campaign são obrigatórios para análise da campanha');
    }

    await this.validateStoreScopeIfPossible(storeId, requester);

    const contextPrompt = this.buildCampaignAnalysisContextPrompt(input);
    const storeContext = await this.resolveStoreAiContext(storeId, contextPrompt);

    if (!this.ai) {
      const fallback = this.buildSafeCampaignAnalysisFallback(input, {
        model: this.model,
        usedFallback: true,
        responseValid: true,
      });
      this.logAiEvent('Campaign copilot fallback returned because API key is missing', {
        requestId,
        storeId,
        durationMs: Date.now() - startedAt,
        model: this.model,
        usedFallback: true,
        responseValid: true,
        failureReason: 'missing_api_key',
      });
      return fallback;
    }

    const modelsToTry = [this.model, ...this.getFallbackModels(this.model)].filter(
      (model, index, list) => model && list.indexOf(model) === index,
    );
    let lastError: unknown = null;
    let lastInvalidResponse: ParsedCampaignSuggestion | null = null;

    for (const model of modelsToTry) {
      try {
        const text = await this.generateGeminiCampaignAnalysisText(input, storeContext, model);
        const parsed = this.parseCampaignAnalysisJson(text);

        if (parsed.payload && this.isValidCampaignAnalysisPayload(parsed.payload)) {
          const response = this.normalizeCampaignAnalysisResponse(parsed.payload, input, {
            model,
            usedFallback: false,
            responseValid: true,
          });
          this.logAiEvent('Campaign copilot analysis generated', {
            requestId,
            storeId,
            durationMs: Date.now() - startedAt,
            model,
            usedFallback: false,
            responseValid: true,
          });
          return response;
        }

        lastInvalidResponse = parsed;
        this.logger.warn(
          `Gemini campaign copilot returned invalid JSON payload: ${parsed.error || 'unknown format error'}`,
        );
        break;
      } catch (error) {
        lastError = error;
        const details = this.getErrorDetails(error);
        this.logger.warn(`Gemini campaign copilot failed for model ${model}: ${details}`);
      }
    }

    const failureReason = lastInvalidResponse?.error || (lastError ? this.getGeminiErrorMessage(lastError) : undefined);
    const fallback = this.buildSafeCampaignAnalysisFallback(input, {
      model: this.model,
      usedFallback: true,
      responseValid: !lastInvalidResponse,
    });
    this.logAiEvent('Campaign copilot fallback returned', {
      requestId,
      storeId,
      durationMs: Date.now() - startedAt,
      model: this.model,
      usedFallback: true,
      responseValid: !lastInvalidResponse,
      failureReason,
    });
    return fallback;
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
        maxOutputTokens: 1800,
        responseMimeType: 'application/json',
        responseJsonSchema: this.campaignSuggestionSchema(),
      },
    });

    return (response.text || '').trim();
  }

  private async generateGeminiCampaignAnalysisText(
    input: CampaignCopilotAnalysisRequest,
    storeContext: StoreAiContext,
    model: string,
  ): Promise<string> {
    const response = await this.ai!.models.generateContent({
      model,
      contents: this.buildCampaignAnalysisPrompt(input, storeContext),
      config: {
        temperature: 0.2,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
        responseJsonSchema: this.campaignAnalysisSchema(),
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
    input?: CampaignAiRequest;
    storeName?: string | null;
    managerName?: string | null;
    tenantName?: string | null;
    managerNotes?: string | null;
    tenantNotes?: string | null;
    hasConnectedMetaAccount?: boolean;
    hasConnectedPage?: boolean;
  }): StoreAiContext {
    const storeName = this.asString(input.storeName) || 'Store não identificada';
    const managerName = this.asString(input.managerName) || null;
    const tenantName = this.asString(input.tenantName) || null;
    const managerNotes = this.asString(input.managerNotes);
    const tenantNotes = this.asString(input.tenantNotes);
    const commercialInput = input.input;
    const extraContext = this.asString(commercialInput?.extraContext);
    const primaryOffer = this.firstSpecificText(commercialInput?.primaryOffer, this.inferMainOffer(input.prompt));
    const region = this.firstSpecificText(commercialInput?.region, this.inferRegionText(input.prompt));
    const sourceText = [
      input.prompt,
      extraContext,
      primaryOffer,
      region,
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
    const salesModel = this.inferSalesModel(sourceText, businessType);
    const notesSummary = this.summarizeNotes([tenantNotes, managerNotes, extraContext].filter(Boolean).join(' '));
    const differentiators = this.inferDifferentiators(sourceText);
    const contextSources = [
      this.asString(input.storeName) ? 'store.name' : '',
      tenantName ? 'tenant.name' : '',
      managerName ? 'manager.name' : '',
      tenantNotes ? 'tenant.notes' : '',
      managerNotes ? 'manager.notes' : '',
      commercialInput?.goal ? 'campaign.goal' : '',
      commercialInput?.funnelStage ? 'campaign.funnelStage' : '',
      commercialInput?.budget ? 'campaign.budget' : '',
      commercialInput?.durationDays ? 'campaign.durationDays' : '',
      primaryOffer ? 'campaign.primaryOffer' : '',
      commercialInput?.destinationType ? 'campaign.destinationType' : '',
      region ? 'campaign.region' : '',
      extraContext ? 'campaign.extraContext' : '',
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
      storeProfile: {
        name: companyName,
        segment,
        businessType,
        city: this.inferCityText(input.prompt),
        region: region || null,
        salesModel,
        mainOffer: primaryOffer || null,
        targetAudienceBase: targetAudience,
        differentiators,
        notesSummary,
      },
      campaignIntent: {
        goal: this.firstSpecificText(commercialInput?.goal, this.inferFallbackObjective(input.prompt)),
        funnelStage: this.normalizeFunnelStage(commercialInput?.funnelStage, input.prompt),
        channelPreference: this.firstSpecificText(commercialInput?.destinationType, this.inferChannelPreference(input.prompt)),
        budgetRange: this.formatBudgetRange(commercialInput?.budget, input.prompt),
        durationDays: this.normalizePositiveNumber(commercialInput?.durationDays),
        destinationType: this.asString(commercialInput?.destinationType) || null,
        primaryOffer: primaryOffer || null,
        region: region || null,
        extraContext: extraContext || null,
      },
      dataAvailability: {
        hasHistoricalCampaigns: false,
        hasPerformanceMetrics: false,
        hasConnectedMetaAccount: !!input.hasConnectedMetaAccount,
        hasConnectedPage: !!input.hasConnectedPage,
      },
    };
  }

  private async resolveStoreAiContext(
    storeId: string,
    prompt: string,
    input?: CampaignAiRequest,
  ): Promise<StoreAiContext> {
    const integrationSignals = await this.resolveIntegrationSignals(storeId);
    const fallback = this.buildStoreAiContextFromMetadata({
      storeId,
      prompt,
      input,
      storeName: 'Store não identificada',
      ...integrationSignals,
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
          input,
          storeName: store.name,
          managerName: store.manager?.name || null,
          tenantName: store.tenant?.name || null,
          managerNotes: store.manager?.notes || null,
          tenantNotes: store.tenant?.notes || null,
          ...integrationSignals,
        }),
      };
    } catch (error) {
      this.logger.warn(`Unable to load store AI context for ${storeId}: ${this.getErrorDetails(error)}`);
      return fallback;
    }
  }

  private async resolveIntegrationSignals(storeId: string): Promise<{
    hasConnectedMetaAccount: boolean;
    hasConnectedPage: boolean;
  }> {
    if (!this.integrationRepository) {
      return { hasConnectedMetaAccount: false, hasConnectedPage: false };
    }

    try {
      const integration = await this.integrationRepository.findOne({
        where: {
          storeId,
          provider: IntegrationProvider.META,
        },
      });
      const hasConnectedIntegration = integration?.status === IntegrationStatus.CONNECTED;
      const metadata = integration?.metadata || {};
      return {
        hasConnectedMetaAccount: !!(
          hasConnectedIntegration
          && (integration.externalAdAccountId || metadata.externalAdAccountId || metadata.adAccountId)
        ),
        hasConnectedPage: !!(
          hasConnectedIntegration
          && (metadata.pageId || metadata.pageName)
        ),
      };
    } catch (error) {
      this.logger.warn(`Unable to load store AI integration signals for ${storeId}: ${this.getErrorDetails(error)}`);
      return { hasConnectedMetaAccount: false, hasConnectedPage: false };
    }
  }

  private async validateStoreScopeIfPossible(
    storeId: string,
    requester?: AuthenticatedUser,
  ): Promise<void> {
    if (!requester?.id || !this.accessScope) {
      return;
    }

    await this.accessScope.validateStoreAccess(requester, storeId);
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

  private buildCampaignAnalysisContextPrompt(input: CampaignCopilotAnalysisRequest): string {
    return JSON.stringify({
      campaign: input.campaign,
      adSet: input.adSet,
      creative: input.creative,
      targeting: input.targeting,
      budget: input.budget,
      location: input.location,
      objective: input.objective,
      cta: input.cta,
      destinationUrl: input.destinationUrl,
    });
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
Você é um assistente de criação de campanhas para o MetaIQ.

Sua função é gerar uma campanha inicial estruturada, útil, específica e segura com base apenas nos dados fornecidos.
Você NÃO é um analista de performance nesta etapa.
Você NÃO deve inventar métricas, preços, promessas, garantias, histórico, benchmark ou fatos não fornecidos.

Responda APENAS JSON válido.
NUNCA use markdown.
NUNCA explique fora do JSON.

Formato obrigatório:
{
  "planner": {
    "businessType": "string | null",
    "goal": "string | null",
    "funnelStage": "top | middle | bottom | null",
    "offer": "string | null",
    "audienceIntent": "string | null",
    "missingInputs": ["string"],
    "assumptions": ["string"]
  },
  "campaign": {
    "campaignName": "string | null",
    "objective": "OUTCOME_TRAFFIC | OUTCOME_LEADS | REACH | null",
    "buyingType": "AUCTION",
    "status": "PAUSED",
    "budget": {
      "type": "daily | lifetime | null",
      "amount": "number | null",
      "currency": "BRL"
    }
  },
  "adSet": {
    "name": "string | null",
    "optimizationGoal": "string | null",
    "billingEvent": "string | null",
    "targeting": {
      "country": "string | null",
      "state": "string | null",
      "stateCode": "string | null",
      "city": "string | null",
      "ageMin": "number | null",
      "ageMax": "number | null",
      "gender": "all | male | female | null",
      "interests": ["string"],
      "excludedInterests": ["string"],
      "placements": ["feed | stories | reels | explore | messenger | audience_network"]
    }
  },
  "creative": {
    "name": "string | null",
    "primaryText": "string | null",
    "headline": "string | null",
    "description": "string | null",
    "cta": "string | null",
    "imageSuggestion": "string | null",
    "destinationUrl": "string | null"
  },
  "review": {
    "summary": "string",
    "strengths": ["string"],
    "risks": ["string"],
    "recommendations": ["string"],
    "confidence": "number entre 0 e 100"
  },
  "validation": {
    "isReadyToPublish": "boolean",
    "qualityScore": "number entre 0 e 100",
    "blockingIssues": ["string"],
    "warnings": ["string"],
    "recommendations": ["string"]
  }
}

Regras:
- Retorne sempre JSON válido e previsível.
- Use null quando não souber um campo.
- campaign.campaignName deve ter até 80 caracteres, citar nicho/oferta/objetivo e evitar nomes genéricos.
- campaign.objective só pode ser OUTCOME_TRAFFIC, OUTCOME_LEADS ou REACH.
- campaign.buyingType deve ser sempre AUCTION.
- campaign.status deve ser sempre PAUSED.
- campaign.budget.amount deve ser número simples em BRL.
- adSet.targeting.country deve ser código ISO-2 quando existir.
- adSet.targeting.state deve ser o nome do estado brasileiro quando existir.
- adSet.targeting.stateCode deve ser a UF em maiúsculas quando existir.
- adSet.targeting.city deve ser a cidade principal quando existir.
- Se identificar uma cidade brasileira, tente preencher state e stateCode também.
- Exemplos válidos: Curitiba -> Paraná / PR, São Paulo -> São Paulo / SP, Rio de Janeiro -> Rio de Janeiro / RJ, Belo Horizonte -> Minas Gerais / MG.
- Se não houver certeza sobre a UF, preencha city e deixe state/stateCode como null. Nesse caso, registre a pendência em missingInputs ou assumptions.
- adSet.targeting.interests e excludedInterests devem ser arrays de strings simples, sem frases longas.
- creative.primaryText deve ter até 260 caracteres, em português do Brasil, com dor explícita, benefício claro e CTA coerente.
- creative.headline deve ter até 80 caracteres.
- creative.description deve ter até 120 caracteres.
- creative.destinationUrl só pode ser https:// se existir.
- review.summary deve resumir a proposta sem inventar performance.
- review.strengths deve listar pontos fortes do setup sugerido.
- review.risks deve listar riscos reais de contexto, segmentação, promessa ou falta de dados.
- review.recommendations deve listar próximos ajustes úteis antes do envio.
- review.confidence deve ser número de 0 a 100.
- validation.isReadyToPublish deve ser false se existir qualquer blockingIssue.
- validation.qualityScore deve ser número de 0 a 100.
- validation.blockingIssues deve listar problemas que impedem publicação.
- validation.warnings deve listar riscos que não bloqueiam, mas pedem atenção.
- validation.recommendations deve listar melhorias práticas e opcionais.
- Considere como blockingIssues: ausência de pageId, ausência de destinationUrl https, ausência de headline, ausência de primaryText, orçamento inválido/zero, objetivo incompatível com a estrutura e dados obrigatórios faltando.
- Considere como warnings: público muito amplo com orçamento baixo, idade muito aberta sem justificativa, copy genérica, CTA fraco, falta de diferencial, ausência de cidade quando relevante e orçamento baixo para o objetivo.
- Use linguagem probabilística nas warnings/recommendations. Nunca afirme performance futura.
- assumptions deve conter apenas inferências conservadoras.
- missingInputs deve listar dados ausentes que limitam a qualidade da campanha.
- Nunca invente métricas, histórico, CPA, CTR, ROAS, criativo vencedor ou benchmark.
- Quando não houver histórico real, trate tudo como configuração inicial/exploratória.

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
- Store profile: ${JSON.stringify(storeContext.storeProfile)}
- Campaign intent: ${JSON.stringify(storeContext.campaignIntent)}
- Data availability: ${JSON.stringify(storeContext.dataAvailability)}
- Prompt version: ${this.promptVersion}

Briefing:
${prompt}
    `.trim();
  }

  private buildCampaignAnalysisPrompt(
    input: CampaignCopilotAnalysisRequest,
    storeContext: StoreAiContext,
  ): string {
    return `
Você é o copiloto de campanha do MetaIQ.

Sua função é analisar uma campanha já preenchida antes da publicação.
Você deve avaliar apenas a estrutura da campanha, coerência de marketing e clareza operacional.

Proibições:
- NÃO invente métricas, benchmarks, CTR, CPC, CPA, ROAS ou projeções.
- NÃO diga que algo "vai performar X% melhor".
- NÃO use dados inexistentes.

Critérios de análise:
- Público: amplitude, segmentação, coerência com objetivo e orçamento.
- Criativo: clareza da copy, headline, CTA, diferencial e oferta percebida.
- Orçamento: coerência com objetivo e com o nível de segmentação.
- Localização: ausência de cidade/UF quando fizer sentido, ou targeting aberto demais.
- Destino: URL válida em https e alinhamento com o objetivo.

Responda APENAS JSON válido.
NUNCA use markdown.
NUNCA explique fora do JSON.

Formato obrigatório:
{
  "analysis": {
    "summary": "string curto",
    "strengths": ["string"],
    "issues": ["string"],
    "improvements": [
      {
        "id": "string",
        "type": "headline|primaryText|targeting|cta|budget|url",
        "label": "string curto",
        "description": "string acionável",
        "suggestedValue": "string|number|object",
        "confidence": "number entre 0 e 100"
      }
    ],
    "confidence": "number entre 0 e 100"
  }
}

Contexto da store:
${JSON.stringify({
      companyName: storeContext.companyName,
      segment: storeContext.segment,
      businessType: storeContext.businessType,
      targetAudience: storeContext.targetAudience,
      dataAvailability: storeContext.dataAvailability,
    }, null, 2)}

Campanha estruturada:
${JSON.stringify({
      campaign: input.campaign,
      adSet: input.adSet || {},
      creative: input.creative || {},
      targeting: input.targeting || {},
      budget: input.budget || {},
      location: input.location || {},
      objective: input.objective || null,
      cta: input.cta || null,
      destinationUrl: input.destinationUrl || null,
    }, null, 2)}
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
      required: ['planner', 'campaign', 'adSet', 'creative', 'review', 'validation'],
      properties: {
        planner: {
          type: 'object',
          additionalProperties: false,
          required: ['businessType', 'goal', 'funnelStage', 'offer', 'audienceIntent', 'missingInputs', 'assumptions'],
          properties: {
            businessType: { type: ['string', 'null'] },
            goal: { type: ['string', 'null'] },
            funnelStage: { type: ['string', 'null'], enum: ['top', 'middle', 'bottom', null] },
            offer: { type: ['string', 'null'] },
            audienceIntent: { type: ['string', 'null'] },
            missingInputs: { type: 'array', items: { type: 'string' } },
            assumptions: { type: 'array', items: { type: 'string' } },
          },
        },
        campaign: {
          type: 'object',
          additionalProperties: false,
          required: ['campaignName', 'objective', 'buyingType', 'status', 'budget'],
          properties: {
            campaignName: { type: ['string', 'null'] },
            objective: { type: ['string', 'null'], enum: ['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'REACH', null] },
            buyingType: { type: 'string', enum: ['AUCTION'] },
            status: { type: 'string', enum: ['PAUSED'] },
            budget: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'amount', 'currency'],
              properties: {
                type: { type: ['string', 'null'], enum: ['daily', 'lifetime', null] },
                amount: { type: ['number', 'null'] },
                currency: { type: 'string', enum: ['BRL'] },
              },
            },
          },
        },
        adSet: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'optimizationGoal', 'billingEvent', 'targeting'],
          properties: {
            name: { type: ['string', 'null'] },
            optimizationGoal: { type: ['string', 'null'] },
            billingEvent: { type: ['string', 'null'] },
            targeting: {
              type: 'object',
              additionalProperties: false,
              required: ['country', 'state', 'stateCode', 'city', 'ageMin', 'ageMax', 'gender', 'interests', 'excludedInterests', 'placements'],
              properties: {
                country: { type: ['string', 'null'] },
                state: { type: ['string', 'null'] },
                stateCode: { type: ['string', 'null'] },
                city: { type: ['string', 'null'] },
                ageMin: { type: ['number', 'null'] },
                ageMax: { type: ['number', 'null'] },
                gender: { type: ['string', 'null'], enum: ['all', 'male', 'female', null] },
                interests: { type: 'array', items: { type: 'string' } },
                excludedInterests: { type: 'array', items: { type: 'string' } },
                placements: {
                  type: 'array',
                  items: { type: 'string', enum: ['feed', 'stories', 'reels', 'explore', 'messenger', 'audience_network'] },
                },
              },
            },
          },
        },
        creative: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'primaryText', 'headline', 'description', 'cta', 'imageSuggestion', 'destinationUrl'],
          properties: {
            name: { type: ['string', 'null'] },
            primaryText: { type: ['string', 'null'] },
            headline: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            cta: { type: ['string', 'null'] },
            imageSuggestion: { type: ['string', 'null'] },
            destinationUrl: { type: ['string', 'null'] },
          },
        },
        review: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'strengths', 'risks', 'recommendations', 'confidence'],
          properties: {
            summary: { type: 'string', minLength: 1 },
            strengths: { type: 'array', items: { type: 'string' } },
            risks: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
          },
        },
        validation: {
          type: 'object',
          additionalProperties: false,
          required: ['isReadyToPublish', 'qualityScore', 'blockingIssues', 'warnings', 'recommendations'],
          properties: {
            isReadyToPublish: { type: 'boolean' },
            qualityScore: { type: 'number' },
            blockingIssues: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    };
  }

  private campaignAnalysisSchema(): unknown {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['analysis'],
      properties: {
        analysis: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'strengths', 'issues', 'improvements', 'confidence'],
          properties: {
            summary: { type: 'string', minLength: 1 },
            strengths: { type: 'array', items: { type: 'string' } },
            issues: { type: 'array', items: { type: 'string' } },
            improvements: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'type', 'label', 'description', 'suggestedValue', 'confidence'],
                properties: {
                  id: { type: 'string', minLength: 1 },
                  type: {
                    type: 'string',
                    enum: ['headline', 'primaryText', 'targeting', 'cta', 'budget', 'url'],
                  },
                  label: { type: 'string', minLength: 1 },
                  description: { type: 'string', minLength: 1 },
                  suggestedValue: {
                    anyOf: [
                      { type: 'string' },
                      { type: 'number' },
                      { type: 'object', additionalProperties: true },
                    ],
                  },
                  confidence: { type: 'number' },
                },
              },
            },
            confidence: { type: 'number' },
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
    metadata: { model?: string; usedFallback?: boolean; responseValid?: boolean } = {},
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
    const normalizedAssumptions = this.normalizeStringArray(payload?.planner?.assumptions).length
      ? this.normalizeStringArray(payload?.planner?.assumptions)
      : this.buildFallbackAssumptions(segment, storeContext);
    const normalizedMissingInputs = this.normalizeStringArray(payload?.planner?.missingInputs).length
      ? this.normalizeStringArray(payload?.planner?.missingInputs)
      : this.buildFallbackMissingInputs(prompt, storeContext);
    const normalizedRisks = this.normalizeStringArray(payload?.review?.risks).length
      ? this.normalizeStringArray(payload?.review?.risks)
      : this.buildFallbackRiskWarnings(metadata.usedFallback, normalizedMissingInputs);
    const normalizedStrengths = this.normalizeStringArray(payload?.review?.strengths).length
      ? this.normalizeStringArray(payload?.review?.strengths)
      : this.buildKnownFacts(storeContext, prompt);
    const normalizedRecommendations = this.normalizeStringArray(payload?.review?.recommendations).length
      ? this.normalizeStringArray(payload?.review?.recommendations)
      : [
          this.buildFallbackDestinationRecommendation(prompt, storeContext),
          this.buildFallbackBudgetRationale(prompt, storeContext),
          ...this.buildFallbackNextDataNeeded().slice(0, 2),
        ].filter(Boolean);
    const objective = this.normalizeStructuredObjective(payload?.campaign?.objective, prompt);
    const funnelStage = this.normalizeStructuredFunnelStage(
      payload?.planner?.funnelStage ?? storeContext?.campaignIntent.funnelStage,
      prompt,
    );
    const budget = this.normalizeStructuredBudget(payload?.campaign?.budget, prompt, storeContext);
    const normalizedCampaignName = this.normalizeStructuredText(
      payload?.campaign?.campaignName,
      this.buildFallbackCampaignName(segment, storeName, prompt),
      80,
    );
    const primaryText = this.normalizeStructuredText(
      payload?.creative?.primaryText,
      this.buildFallbackCopy(segment, storeContext),
      260,
    );
    const headline = this.normalizeStructuredText(
      payload?.creative?.headline,
      normalizedCampaignName,
      80,
    );
    const audienceIntent = this.normalizeStructuredText(
      payload?.planner?.audienceIntent,
      this.buildFallbackAudience(segment, storeContext),
      260,
    );
    const description = this.normalizeOptionalStructuredText(payload?.creative?.description, 120);
    const cta = this.normalizeStructuredCta(payload?.creative?.cta, prompt, storeContext);
    const destinationUrl = this.normalizeHttpsUrl(payload?.creative?.destinationUrl);
    const interestFallbacks = this.buildInterestFallbacks(segment, storeContext);
    const targeting = this.normalizeStructuredTargeting(payload?.adSet?.targeting, prompt, storeContext, interestFallbacks);
    const planner: AiPlannerOutput = {
      businessType: this.normalizeOptionalStructuredText(
        payload?.planner?.businessType,
        120,
      ) || this.normalizeOptionalStructuredText(storeContext?.businessType, 120),
      goal: this.normalizeOptionalStructuredText(
        payload?.planner?.goal,
        160,
      ) || this.normalizeOptionalStructuredText(storeContext?.campaignIntent.goal, 160),
      funnelStage,
      offer: this.normalizeOptionalStructuredText(
        payload?.planner?.offer,
        180,
      ) || this.normalizeOptionalStructuredText(
        storeContext?.campaignIntent.primaryOffer || storeContext?.storeProfile.mainOffer,
        180,
      ),
      audienceIntent,
      missingInputs: normalizedMissingInputs,
      assumptions: normalizedAssumptions,
    };
    const campaign: AiCampaignOutput = {
      campaignName: normalizedCampaignName,
      objective,
      buyingType: 'AUCTION',
      status: 'PAUSED',
      budget,
    };
    const adSet: AiAdSetOutput = {
      name: this.normalizeStructuredText(
        payload?.adSet?.name,
        `${normalizedCampaignName} | Publico 1`,
        120,
      ),
      optimizationGoal: this.normalizeOptionalStructuredText(
        payload?.adSet?.optimizationGoal,
        80,
      ) || this.buildFallbackOptimizationGoal(objective),
      billingEvent: this.normalizeOptionalStructuredText(
        payload?.adSet?.billingEvent,
        80,
      ) || this.buildFallbackBillingEvent(objective),
      targeting,
    };
    const creative: AiCreativeOutput = {
      name: this.normalizeStructuredText(
        payload?.creative?.name,
        `${normalizedCampaignName} | Criativo 1`,
        120,
      ),
      primaryText,
      headline,
      description,
      cta,
      imageSuggestion: this.normalizeOptionalStructuredText(
        payload?.creative?.imageSuggestion,
        220,
      ) || this.buildFallbackCreativeIdeas(segment, [], storeContext)[0],
      destinationUrl,
    };
    const review: AiReviewOutput = {
      summary: this.normalizeStructuredText(
        payload?.review?.summary,
        this.buildFallbackCampaignAngle(segment, prompt, storeContext),
        320,
      ),
      strengths: normalizedStrengths,
      risks: normalizedRisks,
      recommendations: normalizedRecommendations,
      confidence: this.normalizeConfidenceScore(payload?.review?.confidence)
        ?? this.inferConfidenceScore(normalizedMissingInputs, normalizedAssumptions, storeContext),
    };
    const validation = this.normalizeValidationOutput(
      payload?.validation,
      { planner, campaign, adSet, creative, review },
      storeContext,
      metadata,
    );

    return {
      planner,
      campaign,
      adSet,
      creative,
      review,
      validation,
      meta: {
        promptVersion: this.promptVersion,
        model: metadata.model || this.model,
        usedFallback: !!metadata.usedFallback,
        responseValid: metadata.responseValid !== false,
      },
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

  private parseCampaignAnalysisJson(raw: string): ParsedCampaignSuggestion {
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
      const validationError = this.getCampaignAnalysisValidationError(payload);
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

  private isValidCampaignAnalysisPayload(payload: unknown): payload is CampaignAnalysisResponse {
    return !this.getCampaignAnalysisValidationError(payload);
  }

  private getCampaignSuggestionValidationError(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return 'payload_not_object';
    }

    const candidate = payload as Record<string, unknown>;
    const requiredObjects = ['planner', 'campaign', 'adSet', 'creative', 'review'];
    const missingObject = requiredObjects.find((field) => typeof candidate[field] !== 'object' || candidate[field] === null || Array.isArray(candidate[field]));
    if (missingObject) {
      return `missing_or_invalid_${missingObject}`;
    }

    const planner = candidate.planner as Record<string, unknown>;
    const campaign = candidate.campaign as Record<string, unknown>;
    const adSet = candidate.adSet as Record<string, unknown>;
    const creative = candidate.creative as Record<string, unknown>;
    const review = candidate.review as Record<string, unknown>;
    const validation = candidate.validation as Record<string, unknown> | undefined;
    const targeting = adSet.targeting as Record<string, unknown> | undefined;

    if (!Array.isArray(planner.missingInputs) || !Array.isArray(planner.assumptions)) {
      return 'missing_or_invalid_planner_arrays';
    }
    if (!campaign.budget || typeof campaign.budget !== 'object' || Array.isArray(campaign.budget)) {
      return 'missing_or_invalid_campaign_budget';
    }
    if (!targeting || typeof targeting !== 'object' || Array.isArray(targeting)) {
      return 'missing_or_invalid_targeting';
    }
    if (!Array.isArray(targeting.interests) || !Array.isArray(targeting.excludedInterests) || !Array.isArray(targeting.placements)) {
      return 'missing_or_invalid_targeting_arrays';
    }
    if (!Array.isArray(review.strengths) || !Array.isArray(review.risks) || !Array.isArray(review.recommendations)) {
      return 'missing_or_invalid_review_arrays';
    }
    if (!this.asString(review.summary)) {
      return 'missing_or_empty_review_summary';
    }
    if (typeof review.confidence !== 'number') {
      return 'missing_or_invalid_confidence';
    }
    if (validation) {
      if (!Array.isArray(validation.blockingIssues) || !Array.isArray(validation.warnings) || !Array.isArray(validation.recommendations)) {
        return 'missing_or_invalid_validation_arrays';
      }
      if (typeof validation.qualityScore !== 'number') {
        return 'missing_or_invalid_validation_qualityScore';
      }
      if (typeof validation.isReadyToPublish !== 'boolean') {
        return 'missing_or_invalid_validation_isReadyToPublish';
      }
    }

    return null;
  }

  private getCampaignAnalysisValidationError(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return 'payload_not_object';
    }

    const candidate = payload as Record<string, unknown>;
    if (typeof candidate.analysis !== 'object' || candidate.analysis === null || Array.isArray(candidate.analysis)) {
      return 'missing_or_invalid_analysis';
    }

    const analysis = candidate.analysis as Record<string, unknown>;
    if (!this.asString(analysis.summary)) {
      return 'missing_or_empty_summary';
    }
    if (!Array.isArray(analysis.strengths) || !Array.isArray(analysis.issues) || !Array.isArray(analysis.improvements)) {
      return 'missing_or_invalid_analysis_arrays';
    }
    const hasInvalidImprovement = analysis.improvements.some((item) => this.getCampaignAnalysisImprovementValidationError(item));
    if (hasInvalidImprovement) {
      return 'missing_or_invalid_analysis_improvement_items';
    }
    if (typeof analysis.confidence !== 'number') {
      return 'missing_or_invalid_analysis_confidence';
    }

    return null;
  }

  private normalizeCampaignAnalysisResponse(
    payload: unknown,
    input: CampaignCopilotAnalysisRequest,
    metadata: { model?: string; usedFallback?: boolean; responseValid?: boolean } = {},
  ): CampaignAnalysisResponse {
    const derived = this.buildDerivedCampaignAnalysis(input);
    const candidate = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
    const analysisPayload = typeof candidate.analysis === 'object' && candidate.analysis !== null
      ? candidate.analysis as Record<string, unknown>
      : {};
    const analysis: AiCampaignCopilotAnalysis = {
      summary: this.normalizeStructuredText(
        analysisPayload.summary,
        derived.summary,
        220,
      ),
      strengths: this.normalizeStringArrayUnique(
        Array.isArray(analysisPayload.strengths) ? analysisPayload.strengths : derived.strengths,
        4,
      ),
      issues: this.normalizeStringArrayUnique(
        Array.isArray(analysisPayload.issues) ? analysisPayload.issues : derived.issues,
        5,
      ),
      improvements: this.normalizeCampaignAnalysisImprovements(
        Array.isArray(analysisPayload.improvements) ? analysisPayload.improvements : derived.improvements,
        5,
        derived.improvements,
      ),
      confidence: this.normalizeConfidenceScore(analysisPayload.confidence) ?? derived.confidence,
    };

    return {
      analysis,
      meta: {
        promptVersion: this.analysisPromptVersion,
        model: metadata.model || this.model,
        usedFallback: !!metadata.usedFallback,
        responseValid: metadata.responseValid !== false,
      },
    };
  }

  private buildSafeCampaignSuggestionFallback(
    prompt: string,
    storeContext?: StoreAiContext,
    metadata: { model?: string; usedFallback?: boolean; responseValid?: boolean } = {},
  ): CampaignSuggestionResponse {
    return this.normalizeCampaignSuggestionResponse({}, prompt, storeContext, {
      usedFallback: true,
      responseValid: true,
      ...metadata,
    });
  }

  private buildSafeCampaignAnalysisFallback(
    input: CampaignCopilotAnalysisRequest,
    metadata: { model?: string; usedFallback?: boolean; responseValid?: boolean } = {},
  ): CampaignAnalysisResponse {
    return this.normalizeCampaignAnalysisResponse({}, input, {
      usedFallback: true,
      responseValid: true,
      ...metadata,
    });
  }

  private logAiEvent(message: string, metadata: {
    requestId?: string;
    storeId: string;
    durationMs: number;
    model: string;
    usedFallback: boolean;
    responseValid: boolean;
    failureReason?: string;
  }): void {
    const payload = {
      module: CampaignAiService.name,
      aiFeature: this.aiFeature,
      promptVersion: this.promptVersion,
      ...metadata,
    };

    if (this.structuredLogger) {
      this.structuredLogger.info(message, payload);
      this.structuredLogger.metric(this.aiFeature, metadata.durationMs, payload);
      return;
    }

    this.logger.log(JSON.stringify(payload));
  }

  private normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => this.asString(item)).filter(Boolean).slice(0, 8)
      : [];
  }

  private normalizeStringArrayUnique(value: unknown, limit: number): string[] {
    return Array.from(new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => this.asString(item).replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    )).slice(0, limit);
  }

  private normalizeConfidenceScore(value: unknown): number | null {
    const numeric = this.normalizePositiveNumber(value);
    if (numeric === null) return null;
    return Math.min(100, Math.max(0, numeric));
  }

  private isCopilotImprovementType(value: unknown): value is AiCampaignCopilotImprovementType {
    return ['headline', 'primaryText', 'targeting', 'cta', 'budget', 'url'].includes(String(value));
  }

  private getCampaignAnalysisImprovementValidationError(value: unknown): string | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return 'item_not_object';
    }

    const item = value as Record<string, unknown>;
    if (!this.asString(item.id)) return 'missing_id';
    if (!this.isCopilotImprovementType(item.type)) return 'invalid_type';
    if (!this.asString(item.label)) return 'missing_label';
    if (!this.asString(item.description)) return 'missing_description';
    if (this.normalizeConfidenceScore(item.confidence) === null) return 'invalid_confidence';

    const suggestedValue = item.suggestedValue;
    const validValue = typeof suggestedValue === 'string'
      || typeof suggestedValue === 'number'
      || (!!suggestedValue && typeof suggestedValue === 'object' && !Array.isArray(suggestedValue));

    return validValue ? null : 'invalid_suggested_value';
  }

  private normalizeCampaignAnalysisImprovements(
    value: unknown,
    limit: number,
    fallback: AiCampaignCopilotImprovement[],
  ): AiCampaignCopilotImprovement[] {
    const normalized = Array.from(new Map(
      (Array.isArray(value) ? value : [])
        .map((item, index) => this.normalizeCampaignAnalysisImprovement(item, index))
        .filter((item): item is AiCampaignCopilotImprovement => !!item)
        .map((item) => [item.id, item]),
    ).values()).slice(0, limit);

    return normalized.length ? normalized : fallback.slice(0, limit);
  }

  private normalizeCampaignAnalysisImprovement(
    value: unknown,
    index: number,
  ): AiCampaignCopilotImprovement | null {
    if (this.getCampaignAnalysisImprovementValidationError(value)) {
      return null;
    }

    const item = value as Record<string, unknown>;
    const type = item.type as AiCampaignCopilotImprovementType;
    const label = this.normalizeStructuredText(item.label, 'Melhoria sugerida', 80);
    const description = this.normalizeStructuredText(item.description, label, 180);
    const normalizedSuggestedValue = this.normalizeCopilotSuggestedValue(type, item.suggestedValue);
    if (normalizedSuggestedValue === null) {
      return null;
    }

    return {
      id: this.asString(item.id) || `${type}-${index + 1}`,
      type,
      label,
      description,
      suggestedValue: normalizedSuggestedValue,
      confidence: this.normalizeConfidenceScore(item.confidence) ?? 50,
    };
  }

  private normalizeCopilotSuggestedValue(
    type: AiCampaignCopilotImprovementType,
    value: unknown,
  ): string | number | Record<string, unknown> | null {
    if (type === 'budget') {
      return this.normalizePositiveNumber(value);
    }

    if (type === 'targeting') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
      }

      const source = value as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      const interests = this.normalizeStringArray(source.interests);
      const ageMin = this.normalizePositiveNumber(source.ageMin);
      const ageMax = this.normalizePositiveNumber(source.ageMax);
      const city = this.asNullableString(source.city);
      const state = this.asNullableString(source.state);

      if (interests.length) normalized.interests = interests;
      if (ageMin !== null) normalized.ageMin = ageMin;
      if (ageMax !== null) normalized.ageMax = ageMax;
      if (city) normalized.city = city;
      if (state) normalized.state = state;

      return Object.keys(normalized).length ? normalized : null;
    }

    if (type === 'url') {
      return this.isHttpsUrl(value) ? this.asString(value) : null;
    }

    const textValue = this.asString(value);
    return textValue || null;
  }

  private buildDerivedCampaignAnalysis(
    input: CampaignCopilotAnalysisRequest,
  ): AiCampaignCopilotAnalysis {
    const objective = this.asString(input.objective || (input.campaign as Record<string, unknown>)?.objective);
    const creative = (input.creative || {}) as Record<string, unknown>;
    const targeting = (input.targeting || {}) as Record<string, unknown>;
    const budget = (input.budget || {}) as Record<string, unknown>;
    const location = (input.location || {}) as Record<string, unknown>;
    const message = this.asString(creative.message || creative.primaryText);
    const headline = this.asString(creative.headline);
    const description = this.asString(creative.description);
    const cta = this.asString(input.cta || creative.cta).toUpperCase();
    const destinationUrl = this.asString(input.destinationUrl || creative.destinationUrl);
    const interests = this.normalizeStringArray((targeting as Record<string, unknown>).interests);
    const placements = this.normalizeStringArray((targeting as Record<string, unknown>).placements);
    const city = this.asString(location.city || targeting.city);
    const stateCode = this.asString(location.state || targeting.stateCode || targeting.state);
    const country = this.asString(location.country || targeting.country).toUpperCase();
    const autoAudience = targeting.autoAudience === true;
    const ageMin = this.normalizePositiveNumber(targeting.ageMin);
    const ageMax = this.normalizePositiveNumber(targeting.ageMax);
    const budgetValue = this.normalizePositiveNumber(budget.value || budget.amount);
    const issues: string[] = [];
    const strengths: string[] = [];
    const improvements: AiCampaignCopilotImprovement[] = [];

    if (objective) {
      strengths.push(`Objetivo definido com clareza para ${this.mapObjectiveLabel(objective)}.`);
    }
    if (destinationUrl && this.isHttpsUrl(destinationUrl)) {
      strengths.push('O destino final está preenchido com URL segura.');
    }
    if (headline && headline.length >= 10) {
      strengths.push('A headline já dá uma direção clara para o criativo.');
    }
    if (cta && !['LEARN_MORE', 'SAIBA MAIS'].includes(cta)) {
      strengths.push('O CTA está mais acionável do que um convite genérico.');
    }
    if (city || stateCode || interests.length) {
      strengths.push('Existe pelo menos um sinal concreto de segmentação de público.');
    }

    if ((autoAudience || !interests.length) && (budgetValue || 0) <= 100) {
      issues.push('Seu público está muito amplo para o orçamento definido.');
      improvements.push({
        id: 'targeting-refine-segmentation',
        type: 'targeting',
        label: 'Público pode ficar mais específico',
        description: 'Reduza a dispersão inicial com interesses centrais e faixa etária mais compatível com o orçamento.',
        suggestedValue: {
          interests: interests.length ? interests.slice(0, 3) : ['serviço local', 'alta intenção', 'remarketing leve'],
          ageMin: ageMin ?? 25,
          ageMax: ageMax ?? 45,
          city: city || undefined,
          state: stateCode || undefined,
        },
        confidence: 82,
      });
    }

    if ((ageMin === 18 && ageMax === 65) || ((ageMax || 0) - (ageMin || 0) >= 35)) {
      issues.push('A faixa etária está aberta demais para uma mensagem mais específica.');
      improvements.push({
        id: 'targeting-age-range',
        type: 'targeting',
        label: 'Faixa etária pode ser reduzida',
        description: 'Ajuste a idade para concentrar a campanha no perfil com maior intenção de resposta.',
        suggestedValue: {
          interests,
          ageMin: Math.max(21, ageMin ?? 25),
          ageMax: Math.min(55, ageMax ?? 45),
          city: city || undefined,
          state: stateCode || undefined,
        },
        confidence: 76,
      });
    }

    if (this.isGenericValidationCopy(message)) {
      issues.push('A copy principal ainda está genérica e pouco diferenciada.');
      improvements.push({
        id: 'primary-text-benefit',
        type: 'primaryText',
        label: 'Copy pode ser mais específica',
        description: 'Deixe o benefício principal explícito já na primeira linha e reduza termos genéricos.',
        suggestedValue: this.buildSuggestedPrimaryText(message, objective, city),
        confidence: 79,
      });
    }

    if (!headline || headline.length < 8) {
      issues.push('A headline ainda não comunica o benefício com clareza.');
      improvements.push({
        id: 'headline-direct',
        type: 'headline',
        label: 'Headline pode ser mais direta',
        description: 'Use uma headline curta, orientada ao benefício ou ao próximo passo.',
        suggestedValue: this.buildSuggestedHeadline(message, objective, city),
        confidence: 84,
      });
    }

    if (this.isWeakValidationCta(cta, this.normalizeStructuredObjective(objective, objective))) {
      issues.push('Esse tipo de campanha tende a funcionar melhor com CTA mais direto.');
      improvements.push({
        id: 'cta-next-step',
        type: 'cta',
        label: 'CTA pode ficar mais acionável',
        description: 'Troque o CTA por uma ação mais próxima da conversão esperada.',
        suggestedValue: this.suggestActionableCta(objective, destinationUrl, message),
        confidence: 81,
      });
    }

    if (!description && !/(garantia|especialista|entrega|benef[ií]cio|diferencial|resultado|agende|frete)/i.test(message)) {
      issues.push('Não está claro o diferencial do serviço na copy.');
      improvements.push({
        id: 'primary-text-differential',
        type: 'primaryText',
        label: 'Falta deixar o diferencial explícito',
        description: 'Inclua prova de valor, diferencial operacional ou contexto de confiança na copy.',
        suggestedValue: this.buildSuggestedPrimaryTextWithDifferential(message, city),
        confidence: 73,
      });
    }

    if (objective === 'OUTCOME_LEADS' && budgetValue !== null && budgetValue < 50) {
      issues.push('O orçamento parece baixo para sustentar aprendizado em geração de leads.');
      improvements.push({
        id: 'budget-leads-minimum',
        type: 'budget',
        label: 'Orçamento inicial pode ficar curto',
        description: 'Suba levemente o orçamento ou reduza o escopo do público para melhorar o aprendizado inicial.',
        suggestedValue: Math.max(50, budgetValue),
        confidence: 70,
      });
    }

    if (country === 'BR' && city && !stateCode) {
      issues.push('A localização está incompleta: falta UF para uma cidade no Brasil.');
      improvements.push({
        id: 'targeting-state-required',
        type: 'targeting',
        label: 'Localização precisa da UF',
        description: 'Defina a UF junto com a cidade para evitar targeting inconsistente.',
        suggestedValue: {
          city,
          state: 'Defina a UF correspondente',
        },
        confidence: 74,
      });
    } else if (!city && !interests.length && (objective === 'OUTCOME_LEADS' || objective === 'OUTCOME_TRAFFIC')) {
      issues.push('A localização está aberta demais para o estágio atual da campanha.');
      improvements.push({
        id: 'targeting-location-focus',
        type: 'targeting',
        label: 'Localização pode ficar mais objetiva',
        description: 'Defina uma cidade principal ou um recorte geográfico mais focado para começar.',
        suggestedValue: {
          interests: ['público local', 'intenção de compra'],
          ageMin: ageMin ?? 25,
          ageMax: ageMax ?? 45,
        },
        confidence: 71,
      });
    }

    if (!destinationUrl || !this.isHttpsUrl(destinationUrl)) {
      issues.push('A URL de destino está ausente ou não usa https.');
      improvements.push({
        id: 'url-secure-destination',
        type: 'url',
        label: 'URL final precisa ser segura',
        description: 'Use uma URL em https e alinhada ao próximo passo esperado no anúncio.',
        suggestedValue: this.buildSuggestedHttpsUrl(destinationUrl),
        confidence: 88,
      });
    }

    const normalizedIssues = this.normalizeStringArrayUnique(issues, 5);
    const normalizedStrengths = this.normalizeStringArrayUnique(
      strengths.length ? strengths : ['A campanha já tem estrutura inicial suficiente para uma revisão orientada.'],
      4,
    );
    const normalizedImprovements = this.normalizeCampaignAnalysisImprovements(
      improvements.length ? improvements : [{
        id: 'primary-text-specificity',
        type: 'primaryText',
        label: 'Copy pode ganhar especificidade',
        description: 'Revise copy, CTA e segmentação para deixar a campanha mais específica.',
        suggestedValue: this.buildSuggestedPrimaryText(message, objective, city),
        confidence: 66,
      }],
      5,
      improvements,
    );
    const confidence = Math.max(
      35,
      Math.min(92, 78 + (normalizedStrengths.length * 4) - (normalizedIssues.length * 6)),
    );

    return {
      summary: normalizedIssues.length
        ? 'A campanha tem base válida, mas ainda precisa de alguns ajustes antes de publicar.'
        : 'A campanha está estruturalmente consistente e só pede refinamentos leves.',
      strengths: normalizedStrengths,
      issues: normalizedIssues,
      improvements: normalizedImprovements,
      confidence,
    };
  }

  private buildSuggestedHeadline(message: string, objective: string, city: string): string {
    if (city) {
      return `Agende agora em ${city}`;
    }
    if (objective === 'OUTCOME_LEADS') {
      return 'Fale com nossa equipe hoje';
    }
    if (objective === 'OUTCOME_TRAFFIC') {
      return 'Conheça a solução completa';
    }
    return 'Descubra o diferencial agora';
  }

  private buildSuggestedPrimaryText(message: string, objective: string, city: string): string {
    const locationText = city ? ` em ${city}` : '';
    if (objective === 'OUTCOME_LEADS') {
      return `Atendimento rápido${locationText} com proposta clara e próximo passo direto. Fale com a equipe e tire suas dúvidas hoje mesmo.`;
    }
    if (objective === 'OUTCOME_TRAFFIC') {
      return `Entenda o principal benefício${locationText} logo no primeiro contato e avance para uma página segura com mais contexto e prova de valor.`;
    }
    return message || `Apresente o benefício principal${locationText} de forma mais clara e direta.`;
  }

  private buildSuggestedPrimaryTextWithDifferential(message: string, city: string): string {
    const base = this.asString(message);
    const locationText = city ? ` em ${city}` : '';
    return base
      ? `${base} Atendimento confiável${locationText}, com diferencial claro já na primeira leitura.`
      : `Atendimento confiável${locationText}, com diferencial claro e próximo passo objetivo logo na primeira leitura.`;
  }

  private suggestActionableCta(objective: string, destinationUrl: string, message: string): string {
    const normalized = `${objective} ${destinationUrl} ${message}`.toUpperCase();
    if (/WHATSAPP|MESSAGE|MENSAG/i.test(normalized)) {
      return 'MESSAGE_PAGE';
    }
    if (/LEAD|AGEND|CONSULTA|ORCAMENTO|ORÇAMENTO/i.test(normalized)) {
      return 'CONTACT_US';
    }
    return 'LEARN_MORE';
  }

  private buildSuggestedHttpsUrl(destinationUrl: string): string {
    const text = this.asString(destinationUrl);
    if (!text) {
      return 'https://seu-dominio.com/oferta';
    }

    try {
      const url = new URL(text);
      if (url.protocol === 'http:') {
        url.protocol = 'https:';
      }
      return url.toString();
    } catch {
      return text.startsWith('https://') ? text : `https://${text.replace(/^https?:\/\//i, '')}`;
    }
  }

  private mapObjectiveLabel(value: string): string {
    switch (String(value).toUpperCase()) {
      case 'OUTCOME_LEADS':
        return 'geração de leads';
      case 'REACH':
        return 'alcance';
      default:
        return 'tráfego';
    }
  }

  private normalizeRecommendationBasis(value: unknown): CampaignRecommendationBasis | null {
    const normalized = this.asString(value);
    return [
      'business_context_only',
      'business_context_with_operational_signals',
      'fallback_business_context',
    ].includes(normalized) ? normalized as CampaignRecommendationBasis : null;
  }

  private inferRecommendationBasis(
    usedFallback: boolean | undefined,
    storeContext?: StoreAiContext,
  ): CampaignRecommendationBasis {
    if (usedFallback) return 'fallback_business_context';
    return storeContext?.dataAvailability.hasConnectedMetaAccount || storeContext?.dataAvailability.hasConnectedPage
      ? 'business_context_with_operational_signals'
      : 'business_context_only';
  }

  private inferConfidenceScore(
    missingInputs: string[],
    assumptions: string[],
    storeContext?: StoreAiContext,
  ): number {
    if (missingInputs.length >= 4 || !storeContext || storeContext.companyName === 'Store não identificada') {
      return 35;
    }

    if (missingInputs.length >= 2 || assumptions.length >= 2) {
      return 58;
    }

    return 72;
  }

  private normalizeValidationOutput(
    value: unknown,
    response: {
      planner: AiPlannerOutput;
      campaign: AiCampaignOutput;
      adSet: AiAdSetOutput;
      creative: AiCreativeOutput;
      review: AiReviewOutput;
    },
    storeContext?: StoreAiContext,
    metadata: { usedFallback?: boolean } = {},
  ): AiValidationOutput {
    const candidate = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    const derivedBlockingIssues = this.buildDerivedBlockingIssues(response, storeContext);
    const derivedWarnings = this.buildDerivedValidationWarnings(response, storeContext, metadata.usedFallback);
    const derivedRecommendations = this.buildDerivedValidationRecommendations(response, storeContext);
    const hasBlockingIssues = Object.prototype.hasOwnProperty.call(candidate, 'blockingIssues');
    const hasWarnings = Object.prototype.hasOwnProperty.call(candidate, 'warnings');
    const hasRecommendations = Object.prototype.hasOwnProperty.call(candidate, 'recommendations');

    const blockingIssues = this.normalizeStringArrayUnique(
      hasBlockingIssues && Array.isArray(candidate.blockingIssues)
        ? candidate.blockingIssues
        : derivedBlockingIssues.length
        ? derivedBlockingIssues
        : ['Não foi possível validar a campanha automaticamente.'],
      6,
    );
    const warnings = this.normalizeStringArrayUnique(
      hasWarnings && Array.isArray(candidate.warnings)
        ? candidate.warnings
        : derivedWarnings,
      6,
    );
    const recommendations = this.normalizeStringArrayUnique(
      hasRecommendations && Array.isArray(candidate.recommendations)
        ? candidate.recommendations
        : derivedRecommendations.length
        ? derivedRecommendations
        : ['Revise manualmente antes de enviar.'],
      6,
    );

    const isReadyToPublish = blockingIssues.length === 0
      && (!Object.prototype.hasOwnProperty.call(candidate, 'isReadyToPublish') || candidate.isReadyToPublish === true);
    const normalizedScore = this.normalizeConfidenceScore(candidate.qualityScore)
      ?? this.deriveQualityScore(response, blockingIssues, warnings, metadata.usedFallback);

    return {
      isReadyToPublish,
      qualityScore: this.adjustQualityScoreForIssues(normalizedScore, blockingIssues, warnings),
      blockingIssues,
      warnings,
      recommendations,
    };
  }

  private buildDerivedBlockingIssues(
    response: {
      planner: AiPlannerOutput;
      campaign: AiCampaignOutput;
      adSet: AiAdSetOutput;
      creative: AiCreativeOutput;
    },
    storeContext?: StoreAiContext,
  ): string[] {
    const issues = [
      storeContext?.dataAvailability.hasConnectedPage ? '' : 'A página da Meta não está conectada para esta store.',
      response.creative.destinationUrl ? '' : 'A campanha precisa de uma destinationUrl válida em https.',
      response.creative.headline ? '' : 'A campanha precisa de headline antes da publicação.',
      response.creative.primaryText ? '' : 'A campanha precisa de primaryText antes da publicação.',
      response.campaign.budget.amount && response.campaign.budget.amount > 0 ? '' : 'O orçamento da campanha está inválido ou zerado.',
      response.campaign.objective ? '' : 'O objetivo da campanha não pôde ser validado.',
      response.adSet.targeting.country ? '' : 'O país do público precisa ser definido.',
      response.adSet.targeting.country !== 'BR' || !response.adSet.targeting.city || response.adSet.targeting.stateCode
        ? ''
        : 'A cidade brasileira precisa estar acompanhada de uma UF válida.',
    ];

    if (response.campaign.objective === 'OUTCOME_LEADS' && !response.creative.cta) {
      issues.push('A campanha de leads precisa de CTA coerente com o próximo passo.');
    }

    return issues.filter(Boolean);
  }

  private buildDerivedValidationWarnings(
    response: {
      planner: AiPlannerOutput;
      campaign: AiCampaignOutput;
      adSet: AiAdSetOutput;
      creative: AiCreativeOutput;
      review: AiReviewOutput;
    },
    storeContext?: StoreAiContext,
    usedFallback?: boolean,
  ): string[] {
    const ageMin = response.adSet.targeting.ageMin;
    const ageMax = response.adSet.targeting.ageMax;
    const ageRange = typeof ageMin === 'number' && typeof ageMax === 'number' ? ageMax - ageMin : 0;
    const budget = response.campaign.budget.amount || 0;
    const isLocalContext = storeContext?.storeProfile.salesModel === 'local' || /servi[cç]o local|gera[cç][aã]o de leads/i.test(response.planner.businessType || '');

    return [
      !response.adSet.targeting.interests.length && budget > 0 && budget <= 100
        ? 'O público está amplo para um orçamento enxuto e pode reduzir a eficiência inicial.'
        : '',
      ageMin === 18 && ageMax === 65 || ageRange >= 40
        ? 'A faixa etária está muito aberta e tende a diluir a mensagem.'
        : '',
      this.isGenericValidationCopy(response.creative.primaryText)
        ? 'A copy principal está genérica e pode reduzir a clareza do benefício.'
        : '',
      this.isWeakValidationCta(response.creative.cta, response.campaign.objective)
        ? 'O CTA parece fraco para o objetivo escolhido.'
        : '',
      !response.planner.offer && !response.creative.description
        ? 'A campanha está sem diferencial evidente, o que pode enfraquecer a proposta.'
        : '',
      isLocalContext && !response.adSet.targeting.city
        ? 'A cidade não foi definida para uma campanha com contexto local.'
        : '',
      response.campaign.objective === 'OUTCOME_LEADS' && budget > 0 && budget < 50
        ? 'O orçamento pode ser baixo para sustentar aprendizado em geração de leads.'
        : '',
      usedFallback ? 'A validação foi completada com fallback local e pede revisão humana adicional.' : '',
      ...response.review.risks,
    ].filter(Boolean);
  }

  private buildDerivedValidationRecommendations(
    response: {
      planner: AiPlannerOutput;
      campaign: AiCampaignOutput;
      adSet: AiAdSetOutput;
      creative: AiCreativeOutput;
    },
    storeContext?: StoreAiContext,
  ): string[] {
    const isLocalContext = storeContext?.storeProfile.salesModel === 'local' || /servi[cç]o local|gera[cç][aã]o de leads/i.test(response.planner.businessType || '');

    return [
      response.creative.headline && response.creative.headline.length >= 20
        ? ''
        : 'Melhore a headline para destacar o benefício principal com mais clareza.',
      response.creative.description ? '' : 'Adicione prova social, garantia operacional ou contexto de confiança.',
      /agora|hoje|ultim|válid|valida/i.test(`${response.creative.primaryText || ''} ${response.creative.description || ''}`)
        ? ''
        : 'Inclua urgência contextual ou uma oferta mais clara, se isso fizer sentido para a operação.',
      response.adSet.targeting.interests.length >= 2
        ? ''
        : 'Segmente melhor o público para reduzir dispersão inicial.',
      response.campaign.objective === 'OUTCOME_LEADS' && /cadastro|agende|solicite|fale/i.test(response.creative.primaryText || '')
        ? ''
        : 'Alinhe a copy com o objetivo da campanha e o próximo passo esperado.',
      this.isGenericValidationCopy(response.creative.primaryText)
        ? 'Deixe o benefício mais explícito na primeira linha da copy.'
        : '',
      isLocalContext && !response.adSet.targeting.city
        ? 'Defina a cidade principal para melhorar a aderência local da campanha.'
        : '',
    ].filter(Boolean);
  }

  private deriveQualityScore(
    response: { review: AiReviewOutput },
    blockingIssues: string[],
    warnings: string[],
    usedFallback?: boolean,
  ): number {
    const baseScore = response.review.confidence || 65;
    let score = baseScore - (blockingIssues.length * 18) - (warnings.length * 6);
    if (usedFallback) {
      score = Math.min(score, 40);
    }
    return Math.max(0, Math.min(100, score));
  }

  private adjustQualityScoreForIssues(score: number, blockingIssues: string[], warnings: string[]): number {
    if (blockingIssues.length) {
      return Math.min(score, 45);
    }
    if (warnings.length >= 4) {
      return Math.min(score, 68);
    }
    return Math.max(0, Math.min(100, score));
  }

  private isGenericValidationCopy(value: string | null): boolean {
    const normalized = this.asString(value).toLowerCase();
    if (!normalized) return true;
    if (normalized.length < 50) return true;
    return /(saiba mais|conheça|conheca|fale com a equipe|solução completa|solucao completa|atendimento de qualidade)/i.test(normalized);
  }

  private isWeakValidationCta(cta: string | null, objective: AiCampaignObjective | null): boolean {
    const normalized = this.asString(cta).toUpperCase();
    if (!normalized) return true;
    if (objective === 'OUTCOME_LEADS') {
      return ['LEARN_MORE', 'SAIBA MAIS'].includes(normalized);
    }
    return false;
  }

  private normalizeStructuredText(value: unknown, fallback: string, maxLength: number): string {
    return this.normalizeOptionalStructuredText(value, maxLength) || fallback.slice(0, maxLength);
  }

  private normalizeOptionalStructuredText(value: unknown, maxLength: number): string | null {
    const normalized = this.asString(value).replace(/\s+/g, ' ').trim();
    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private normalizeStructuredObjective(value: unknown, prompt: string): AiCampaignObjective {
    const normalized = this.asString(value).toUpperCase();
    if (['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'REACH'].includes(normalized)) {
      return normalized as AiCampaignObjective;
    }

    if (/(lead|cadastro|captacao|captação|whatsapp|conversa|formul[aá]rio)/i.test(normalized)) {
      return 'OUTCOME_LEADS';
    }
    if (/(alcance|awareness|reconhecimento)/i.test(normalized)) {
      return 'REACH';
    }

    const fallback = this.inferFallbackObjective(prompt);
    if (fallback === 'Leads' || fallback === 'Conversas') return 'OUTCOME_LEADS';
    if (fallback === 'Alcance') return 'REACH';
    return 'OUTCOME_TRAFFIC';
  }

  private normalizeStructuredFunnelStage(value: unknown, prompt: string): AiFunnelStage | null {
    const normalized = this.asString(value).toLowerCase();
    if (['top', 'middle', 'bottom'].includes(normalized)) {
      return normalized as AiFunnelStage;
    }
    if (normalized === 'remarketing' || normalized === 'retention') {
      return 'bottom';
    }

    const inferred = this.normalizeFunnelStage(null, prompt);
    if (inferred === 'top' || inferred === 'middle' || inferred === 'bottom') {
      return inferred as AiFunnelStage;
    }
    if (inferred === 'remarketing' || inferred === 'retention') {
      return 'bottom';
    }

    return null;
  }

  private normalizeStructuredBudget(
    budget: unknown,
    prompt: string,
    storeContext?: StoreAiContext,
  ): AiCampaignBudgetOutput {
    const candidate = typeof budget === 'object' && budget !== null ? budget as Record<string, unknown> : {};
    const normalizedType = this.asString(candidate.type);
    const type = ['daily', 'lifetime'].includes(normalizedType)
      ? normalizedType as 'daily' | 'lifetime'
      : /total|vital[ií]cio|campanha inteira/i.test(prompt)
      ? 'lifetime'
      : /por dia|\/dia|di[aá]rio/i.test(prompt)
      ? 'daily'
      : null;
    const amount = this.normalizePositiveNumber(candidate.amount)
      ?? this.normalizePositiveNumber(storeContext?.campaignIntent.budgetRange?.match(/\d+/)?.[0] || null)
      ?? this.normalizePositiveNumber(prompt.match(/\d{2,6}/)?.[0] || null);

    return {
      type,
      amount: amount && amount > 0 ? amount : null,
      currency: 'BRL',
    };
  }

  private normalizeStructuredCta(
    value: unknown,
    prompt: string,
    storeContext?: StoreAiContext,
  ): string {
    return this.normalizeOptionalStructuredText(value, 40)
      || this.inferFallbackCta(prompt, storeContext);
  }

  private normalizeHttpsUrl(value: unknown): string | null {
    const text = this.asString(value);
    if (!text) return null;

    try {
      const parsed = new URL(text);
      return parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  private isHttpsUrl(value: unknown): value is string {
    try {
      return new URL(String(value)).protocol === 'https:';
    } catch {
      return false;
    }
  }

  private buildInterestFallbacks(segment: string, storeContext?: StoreAiContext): string[] {
    const explicit = this.asString(storeContext?.targetAudience);
    const combined = [explicit, segment].filter(Boolean).join(', ');

    return combined
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
      .slice(0, 6);
  }

  private normalizeStructuredTargeting(
    targeting: unknown,
    prompt: string,
    storeContext: StoreAiContext | undefined,
    interestFallbacks: string[],
  ): AiAdSetOutput['targeting'] {
    const candidate = typeof targeting === 'object' && targeting !== null ? targeting as Record<string, unknown> : {};
    const gender = this.normalizeStructuredGender(candidate.gender);
    const ageMin = this.normalizeStructuredAge(candidate.ageMin);
    const ageMax = this.normalizeStructuredAge(candidate.ageMax);
    const normalizedCountry = this.normalizeCountry(candidate.country) || this.inferStructuredCountry(prompt);
    const normalizedState = this.normalizeStructuredBrazilianState(
      candidate.stateCode,
      candidate.state,
      normalizedCountry,
      candidate.city,
      prompt,
    );
    const normalizedCity = this.normalizeOptionalStructuredText(candidate.city, 120) || null;

    return {
      country: normalizedCountry,
      state: normalizedState?.name || null,
      stateCode: normalizedState?.code || null,
      city: normalizedCity,
      ageMin,
      ageMax: ageMin !== null && ageMax !== null && ageMax < ageMin ? ageMin : ageMax,
      gender,
      interests: this.normalizeArrayOfStrings(candidate.interests, 8).length
        ? this.normalizeArrayOfStrings(candidate.interests, 8)
        : interestFallbacks,
      excludedInterests: this.normalizeArrayOfStrings(candidate.excludedInterests, 8),
      placements: this.normalizePlacements(candidate.placements, prompt),
    };
  }

  private normalizeStructuredGender(value: unknown): AiGenderOutput | null {
    const normalized = this.asString(value).toLowerCase();
    if (['all', 'male', 'female'].includes(normalized)) {
      return normalized as AiGenderOutput;
    }
    if (normalized === 'masculino') return 'male';
    if (normalized === 'feminino') return 'female';
    return null;
  }

  private normalizeStructuredAge(value: unknown): number | null {
    const numeric = this.normalizePositiveNumber(value);
    if (numeric === null) return null;
    return Math.min(65, Math.max(18, numeric));
  }

  private normalizePlacements(value: unknown, prompt: string): AiPlacement[] {
    const raw = Array.isArray(value) ? value : [];
    const mapped = raw
      .map((item) => this.asString(item).toLowerCase())
      .map((item) => {
        if (item.includes('story')) return 'stories';
        if (item.includes('reel')) return 'reels';
        if (item.includes('explore')) return 'explore';
        if (item.includes('messenger')) return 'messenger';
        if (item.includes('audience')) return 'audience_network';
        if (item.includes('feed')) return 'feed';
        return '';
      })
      .filter((item): item is AiPlacement => ['feed', 'stories', 'reels', 'explore', 'messenger', 'audience_network'].includes(item));

    if (mapped.length) {
      return Array.from(new Set(mapped)).slice(0, 6);
    }

    if (/stories/i.test(prompt) || /reels/i.test(prompt)) {
      return ['stories', 'reels', 'feed'];
    }

    if (/feed/i.test(prompt)) {
      return ['feed'];
    }

    return [];
  }

  private inferStructuredCountry(prompt: string): string | null {
    const normalized = prompt.toLowerCase();
    if (/\bbrasil\b|\bbr\b/.test(normalized)) return 'BR';
    if (/\bportugal\b|\bpt\b/.test(normalized)) return 'PT';
    if (/\bargentina\b|\bar\b/.test(normalized)) return 'AR';
    if (/\bm[eé]xico\b|\bmx\b/.test(normalized)) return 'MX';
    if (/\beua\b|\bestados unidos\b|\busa\b|\bus\b/.test(normalized)) return 'US';
    return null;
  }

  private normalizeStructuredBrazilianState(
    stateCodeValue: unknown,
    stateNameValue: unknown,
    country: string | null,
    cityValue: unknown,
    prompt: string,
  ): { code: string; name: string } | null {
    if (country !== 'BR') {
      return null;
    }

    const directMatch = this.normalizeBrazilianState(stateCodeValue) || this.normalizeBrazilianState(stateNameValue);
    if (directMatch) {
      return directMatch;
    }

    const cityMatch = this.inferBrazilianStateFromCity(this.normalizeOptionalStructuredText(cityValue, 120) || '');
    if (cityMatch) {
      return cityMatch;
    }

    return this.inferBrazilianStateFromCity(prompt);
  }

  private normalizeBrazilianState(value: unknown): { code: string; name: string } | null {
    const normalized = this.normalizeLocationToken(this.asString(value));
    if (!normalized) {
      return null;
    }

    const states = [
      ['AC', 'Acre'],
      ['AL', 'Alagoas'],
      ['AP', 'Amapa'],
      ['AM', 'Amazonas'],
      ['BA', 'Bahia'],
      ['CE', 'Ceara'],
      ['DF', 'Distrito Federal'],
      ['ES', 'Espirito Santo'],
      ['GO', 'Goias'],
      ['MA', 'Maranhao'],
      ['MT', 'Mato Grosso'],
      ['MS', 'Mato Grosso do Sul'],
      ['MG', 'Minas Gerais'],
      ['PA', 'Para'],
      ['PB', 'Paraiba'],
      ['PR', 'Parana'],
      ['PE', 'Pernambuco'],
      ['PI', 'Piaui'],
      ['RJ', 'Rio de Janeiro'],
      ['RN', 'Rio Grande do Norte'],
      ['RS', 'Rio Grande do Sul'],
      ['RO', 'Rondonia'],
      ['RR', 'Roraima'],
      ['SC', 'Santa Catarina'],
      ['SP', 'Sao Paulo'],
      ['SE', 'Sergipe'],
      ['TO', 'Tocantins'],
    ] as const;

    const match = states.find(([code, name]) =>
      this.normalizeLocationToken(code) === normalized || this.normalizeLocationToken(name) === normalized,
    );

    return match ? { code: match[0], name: match[1] } : null;
  }

  private inferBrazilianStateFromCity(value: string): { code: string; name: string } | null {
    const normalized = this.normalizeLocationToken(value);
    if (!normalized) {
      return null;
    }

    const cities: Array<{ pattern: RegExp; state: { code: string; name: string } }> = [
      { pattern: /\bcuritiba\b/, state: { code: 'PR', name: 'Parana' } },
      { pattern: /\bsao paulo\b/, state: { code: 'SP', name: 'Sao Paulo' } },
      { pattern: /\brio de janeiro\b/, state: { code: 'RJ', name: 'Rio de Janeiro' } },
      { pattern: /\bbelo horizonte\b/, state: { code: 'MG', name: 'Minas Gerais' } },
      { pattern: /\bporto alegre\b/, state: { code: 'RS', name: 'Rio Grande do Sul' } },
      { pattern: /\bflorianopolis\b/, state: { code: 'SC', name: 'Santa Catarina' } },
      { pattern: /\bsalvador\b/, state: { code: 'BA', name: 'Bahia' } },
      { pattern: /\bfortaleza\b/, state: { code: 'CE', name: 'Ceara' } },
      { pattern: /\bbrasilia\b/, state: { code: 'DF', name: 'Distrito Federal' } },
      { pattern: /\bgoiania\b/, state: { code: 'GO', name: 'Goias' } },
      { pattern: /\brecife\b/, state: { code: 'PE', name: 'Pernambuco' } },
    ];

    return cities.find((entry) => entry.pattern.test(normalized))?.state || null;
  }

  private normalizeLocationToken(value: string | null | undefined): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private normalizeArrayOfStrings(value: unknown, limit: number): string[] {
    return Array.isArray(value)
      ? value.map((item) => this.asString(item)).filter(Boolean).slice(0, limit)
      : [];
  }

  private buildFallbackOptimizationGoal(objective: AiCampaignObjective): string {
    if (objective === 'OUTCOME_LEADS') return 'Leads';
    if (objective === 'REACH') return 'Reach';
    return 'Link Clicks';
  }

  private buildFallbackBillingEvent(objective: AiCampaignObjective): string {
    if (objective === 'OUTCOME_LEADS' || objective === 'OUTCOME_TRAFFIC') return 'Impressions';
    return 'Impressions';
  }

  private buildKnownFacts(storeContext: StoreAiContext | undefined, prompt: string): string[] {
    const facts = [
      storeContext?.companyName && storeContext.companyName !== 'Store não identificada'
        ? `Empresa informada: ${storeContext.companyName}.`
        : '',
      storeContext?.segment ? `Segmento identificado: ${storeContext.segment}.` : '',
      storeContext?.businessType ? `Tipo de negócio identificado: ${storeContext.businessType}.` : '',
      prompt ? 'Briefing da campanha foi informado pelo usuário.' : '',
      storeContext?.contextSources?.length
        ? `Fontes usadas: ${storeContext.contextSources.join(', ')}.`
        : '',
      storeContext?.dataAvailability.hasConnectedMetaAccount ? 'Conta Meta conectada disponível.' : '',
      storeContext?.dataAvailability.hasConnectedPage ? 'Página Meta conectada disponível.' : '',
      'Não há histórico real de campanhas ou métricas de performance disponível para esta recomendação.',
    ].filter(Boolean);

    return facts.length ? facts.slice(0, 6) : ['A sugestão foi baseada apenas no briefing enviado.'];
  }

  private buildFallbackAssumptions(segment: string, storeContext?: StoreAiContext): string[] {
    return [
      `A segmentação inicial foi inferida de forma conservadora para ${segment}.`,
      `A mensagem deve ser revisada por uma pessoa antes de envio para a Meta.`,
      storeContext?.businessType ? `O funil sugerido assume uma operação de ${storeContext.businessType}.` : '',
    ].filter(Boolean);
  }

  private buildFallbackMissingInputs(prompt: string, storeContext?: StoreAiContext): string[] {
    const missing = [];
    if (!/r\$\s*\d+|\b\d{2,6}\s*(?:por dia|\/dia|di[aá]rio|total|budget|or[cç]amento)/i.test(prompt)) {
      missing.push('Orçamento da campanha.');
    }
    if (!/(brasil|s[aã]o paulo|curitiba|rio de janeiro|cidade|regi[aã]o|bairro|estado)/i.test(prompt)) {
      missing.push('Região ou localização prioritária.');
    }
    if (!/(site|landing|whatsapp|direct|formul[aá]rio|mensagem|ecommerce|loja online)/i.test(prompt)) {
      missing.push('Destino principal da campanha.');
    }
    missing.push('Histórico de campanhas, CPA, ROAS, CTR e criativos anteriores.');

    if (!storeContext || storeContext.companyName === 'Store não identificada') {
      missing.push('Dados cadastrais completos da store.');
    }

    return Array.from(new Set(missing)).slice(0, 6);
  }

  private buildFallbackRiskWarnings(usedFallback: boolean | undefined, missingInputs: string[]): string[] {
    return [
      usedFallback ? 'Resposta gerada por fallback local porque a IA externa não retornou uma saída válida.' : '',
      missingInputs.length ? 'A recomendação não usa métricas reais de performance nesta fase.' : '',
      'Revise promessas comerciais, políticas Meta e dados de orçamento antes de publicar.',
    ].filter(Boolean);
  }

  private buildFallbackCampaignAngle(segment: string, prompt: string, storeContext?: StoreAiContext): string {
    const stage = storeContext?.campaignIntent.funnelStage || this.normalizeFunnelStage(null, prompt);
    if (stage === 'remarketing') return `Reativação de público quente em ${segment} com prova social e CTA direto.`;
    if (stage === 'top') return `Educação inicial para ${segment}, apresentando dor, contexto e benefício principal.`;
    if (stage === 'bottom') return `Oferta direta para ${segment}, priorizando urgência contextual e próximo passo claro.`;
    return `Captação inicial para ${segment}, combinando dor explícita, benefício e chamada para conversa.`;
  }

  private buildFallbackFunnelStageRecommendation(storeContext?: StoreAiContext): string {
    const stage = storeContext?.campaignIntent.funnelStage || 'bottom';
    const labels: Record<string, string> = {
      top: 'Topo de funil exploratório para aquecer público frio sem histórico real.',
      middle: 'Meio de funil para qualificar intenção antes de pedir ação direta.',
      bottom: 'Fundo de funil inicial para validar oferta, CTA e canal com orçamento controlado.',
      remarketing: 'Remarketing planejado para públicos quentes quando houver audiência disponível.',
      retention: 'Retenção/reativação quando houver base ou lista disponível para trabalhar.',
    };
    return labels[stage] || labels.bottom;
  }

  private buildFallbackDestinationRecommendation(prompt: string, storeContext?: StoreAiContext): string {
    const channel = storeContext?.campaignIntent.destinationType
      || storeContext?.campaignIntent.channelPreference
      || this.inferChannelPreference(prompt);
    if (/whatsapp|messages|mensagem|direct/i.test(channel || '')) {
      return 'Usar conversa como destino inicial para reduzir atrito e qualificar intenção manualmente.';
    }
    if (/leads|form/i.test(channel || '')) {
      return 'Usar formulário quando a meta for capturar dados estruturados e qualificar depois.';
    }
    if (/instagram/i.test(channel || '')) {
      return 'Usar Instagram como apoio de descoberta, mantendo CTA claro para o próximo passo.';
    }
    return 'Usar website/landing page se houver destino válido e proposta clara para conversão.';
  }

  private buildFallbackBudgetRationale(prompt: string, storeContext?: StoreAiContext): string {
    const budget = storeContext?.campaignIntent.budgetRange || this.buildFallbackBudget(prompt);
    return `${budget} Tratar como teste inicial, sem assumir CPA, ROAS ou CTR históricos até haver dados reais.`;
  }

  private buildFallbackNextDataNeeded(): string[] {
    return [
      'CTR por criativo.',
      'CPA ou custo por lead/conversa.',
      'ROAS ou receita atribuída.',
      'Ticket médio e margem.',
      'Criativos e públicos que geraram melhor resposta.',
    ];
  }

  private inferFallbackObjective(prompt: string): string {
    if (/(lead|formul[aá]rio|cadastro|diagn[oó]stico)/i.test(prompt)) return 'Leads';
    if (/(whatsapp|direct|mensagem|conversa)/i.test(prompt)) return 'Conversas';
    if (/(alcance|awareness|reconhecimento)/i.test(prompt)) return 'Alcance';
    return 'Tráfego';
  }

  private inferFallbackCta(prompt: string, storeContext?: StoreAiContext): string {
    const normalized = `${prompt} ${storeContext?.businessType || ''}`.toLowerCase();
    if (/(whatsapp|direct|mensagem|conversa|lead|servi[cç]o|consultoria|im[oó]vel)/i.test(normalized)) {
      return 'Fale conosco';
    }
    if (/(comprar|ecommerce|loja online|promo[cç][aã]o)/i.test(normalized)) {
      return 'Comprar agora';
    }
    return 'Saiba mais';
  }

  private inferMainOffer(text: string): string {
    const match = text.match(/(?:oferta|produto|servi[cç]o|foco|vender|promover|campanha para)\s+(?:de|do|da|para)?\s*([^.,;\n]{4,120})/i);
    return this.asString(match?.[1]);
  }

  private inferRegionText(text: string): string {
    const match = text.match(/\b(?:em|para|regi[aã]o de|cidade de)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÀ-ÿ\s-]{2,60})/);
    return this.asString(match?.[1]);
  }

  private inferCityText(text: string): string | null {
    const city = this.inferRegionText(text);
    return city || null;
  }

  private inferSalesModel(text: string, businessType: string): 'local' | 'ecommerce' | 'hybrid' | 'unknown' {
    const normalized = `${text} ${businessType}`.toLowerCase();
    const local = /(local|bairro|cidade|agendar|or[cç]amento|whatsapp|direct|instala[cç][aã]o|cl[ií]nica|pet shop)/i.test(normalized);
    const ecommerce = /(e-?commerce|loja online|site|checkout|cat[aá]logo|comprar online)/i.test(normalized);
    if (local && ecommerce) return 'hybrid';
    if (ecommerce) return 'ecommerce';
    if (local) return 'local';
    return 'unknown';
  }

  private summarizeNotes(text: string): string {
    const normalized = this.asString(text).replace(/\s+/g, ' ');
    return normalized ? normalized.slice(0, 320) : 'Sem notas comerciais adicionais.';
  }

  private inferDifferentiators(text: string): string[] {
    const candidates = [
      /(atendimento\s+(?:consultivo|r[aá]pido|humanizado))/i,
      /(entrega\s+(?:r[aá]pida|local|nacional))/i,
      /(pre[cç]o\s+(?:competitivo|acess[ií]vel|premium))/i,
      /(alto padr[aã]o)/i,
      /(agendamento\s+(?:r[aá]pido|online))/i,
      /(curadoria\s+(?:especializada|personalizada))/i,
      /(produto[s]?\s+(?:premium|exclusivo[s]?|artesanal))/i,
    ];
    return candidates
      .map((pattern) => text.match(pattern)?.[1])
      .map((value) => this.asString(value))
      .filter(Boolean)
      .slice(0, 5);
  }

  private normalizeFunnelStage(value: unknown, prompt: string): string | null {
    const normalized = this.asString(value).toLowerCase();
    if (['top', 'middle', 'bottom', 'remarketing', 'retention'].includes(normalized)) return normalized;
    const text = prompt.toLowerCase();
    if (/remarketing|retargeting|p[uú]blico quente|visitantes|engajados/i.test(text)) return 'remarketing';
    if (/topo|awareness|reconhecimento|descoberta|p[uú]blico frio/i.test(text)) return 'top';
    if (/meio|considera[cç][aã]o|nutri[cç][aã]o|comparar/i.test(text)) return 'middle';
    if (/fundo|convers[aã]o|comprar|lead|whatsapp|or[cç]amento/i.test(text)) return 'bottom';
    return null;
  }

  private inferChannelPreference(prompt: string): string | null {
    if (/whatsapp/i.test(prompt)) return 'whatsapp';
    if (/direct|instagram/i.test(prompt)) return 'instagram';
    if (/formul[aá]rio|lead form|cadastro/i.test(prompt)) return 'leads';
    if (/site|landing|ecommerce|loja online/i.test(prompt)) return 'website';
    if (/mensagem|messenger|conversa/i.test(prompt)) return 'messages';
    return null;
  }

  private formatBudgetRange(budget: unknown, prompt: string): string | null {
    const numericBudget = this.normalizePositiveNumber(budget);
    if (numericBudget) {
      return `R$ ${numericBudget.toLocaleString('pt-BR')} informados pelo usuário.`;
    }
    const match = prompt.match(/r\$\s*(\d{2,6}(?:[.,]\d{1,2})?)|(?:or[cç]amento|budget|investimento)\s*(?:de|em)?\s*(\d{2,6}(?:[.,]\d{1,2})?)/i);
    const value = match?.[1] || match?.[2];
    return value ? `R$ ${value.replace('.', ',')} informado no briefing.` : null;
  }

  private normalizePositiveNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    }
    return null;
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
