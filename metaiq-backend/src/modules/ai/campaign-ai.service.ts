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
import { Campaign } from '../campaigns/campaign.entity';
import { StoreIntegration } from '../integrations/store-integration.entity';
import { MetricDaily } from '../metrics/metric-daily.entity';
import { Store } from '../stores/store.entity';
import {
  AiAdSetOutput,
  AiCampaignBudgetOutput,
  AiCampaignDestinationType,
  CampaignAiIntent,
  CampaignAiFailureDebug,
  CampaignAiFailureReason,
  CampaignAiFailureResponse,
  AiCampaignCopilotAnalysis,
  AiCampaignBusinessDiagnosis,
  AiCampaignAudienceSummary,
  AiCampaignCopilotImprovement,
  AiCampaignCopilotImprovementType,
  AiCampaignExecutiveDecision,
  AiCampaignExecutiveDecisionValue,
  AiCampaignObjective,
  AiCampaignOutput,
  AiCreativeOutput,
  AiFunnelStage,
  AiGenderOutput,
  AiPlacement,
  AiPlannerOutput,
  AiCampaignPerformanceAnalysis,
  AiCampaignRiskLevel,
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
type CampaignDestinationType = AiCampaignDestinationType;
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

export type CampaignSuggestionResponse = CampaignAiStructuredResponse | CampaignAiFailureResponse;
export type CampaignAnalysisResponse = CampaignCopilotAnalysisResponse | CampaignAiFailureResponse;

interface StoreAiContext {
  storeId: string;
  storeName: string;
  companyName: string;
  segment: string;
  description: string;
  website: string | null;
  instagram: string | null;
  whatsapp: string | null;
  targetAudience: string;
  businessType: string;
  managerName: string | null;
  tenantName: string | null;
  tenantNotes: string | null;
  managerNotes: string | null;
  contextSources: string[];
  storeProfile: {
    name: string;
    segment: string;
    businessType: string;
    city: string | null;
    region: string | null;
    instagram: string | null;
    whatsapp: string | null;
    salesModel: 'local' | 'ecommerce' | 'hybrid' | 'unknown';
    mainOffer: string | null;
    targetAudienceBase: string;
    differentiators: string[];
    notesSummary: string;
  };
  tenantProfile: {
    businessType: string | null;
    notes: string | null;
    accountType: string | null;
  };
  managerProfile: {
    notes: string | null;
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
    communicationTone: string | null;
  };
  historicalContext: {
    campaignCount: number;
    recentCampaigns: Array<{
      name: string;
      objective: string | null;
      dailyBudget: number | null;
      score: number | null;
      status: string | null;
    }>;
    metrics: {
      ctr: number | null;
      cpa: number | null;
      roas: number | null;
    };
    audienceSignals: string[];
  };
  dataAvailability: {
    hasHistoricalCampaigns: boolean;
    hasPerformanceMetrics: boolean;
    hasConnectedMetaAccount: boolean;
    hasConnectedPage: boolean;
    hasWebsite: boolean;
    hasWhatsapp: boolean;
    hasInstagram: boolean;
    hasMessageDestinationAvailable: boolean;
  };
  fieldOrigins: {
    segment: CampaignIntentFieldSource | null;
    businessType: CampaignIntentFieldSource | null;
    city: CampaignIntentFieldSource | null;
    region: CampaignIntentFieldSource | null;
    goal: CampaignIntentFieldSource | null;
    funnelStage: CampaignIntentFieldSource | null;
    budget: CampaignIntentFieldSource | null;
    destinationType: CampaignIntentFieldSource | null;
    channelPreference: CampaignIntentFieldSource | null;
    primaryOffer: CampaignIntentFieldSource | null;
    extraContext: CampaignIntentFieldSource | null;
  };
}

interface DeterministicCampaignIntent extends CampaignAiIntent {
  budgetType: CampaignBudgetType | null;
  destinationType: CampaignDestinationType | null;
}

interface ParsedCampaignSuggestion {
  payload: unknown;
  error?: string;
  truncated?: boolean;
  rawText?: string;
  candidateText?: string;
  finishReason?: string | null;
  maxOutputTokens?: number | null;
  validationPath?: string;
  normalizedKeys?: string[];
}

interface GeminiTextResponse {
  text: string;
  rawText: string;
  candidateText: string;
  finishReason: string | null;
  maxOutputTokens: number | null;
}

interface BriefingConstraints {
  expectedSegment: string | null;
  expectedObjective: AiCampaignObjective | null;
  expectedBudget: number | null;
  expectedBudgetType: AiCampaignBudgetOutput['type'];
  expectedCta: string | null;
  expectedDestinationType: CampaignDestinationType | null;
  expectsRemarketing: boolean;
}

type CampaignIntentFieldSource =
  | 'prompt'
  | 'input'
  | 'backend_inference'
  | 'store'
  | 'tenant_default'
  | 'fallback';

interface ExtractedPromptBriefing {
  goal: string | null;
  objective: AiCampaignObjective | null;
  budget: number | null;
  budgetType: AiCampaignBudgetOutput['type'];
  destinationType: CampaignDestinationType | null;
  segment: string | null;
  region: string | null;
  city: string | null;
  funnelStage: string | null;
  channelPreference: string | null;
  primaryOffer: string | null;
  remarketingExpected: boolean;
  cta: string | null;
}

interface ConsistencyDebugInfo {
  consistencyErrors: string[];
  expectedBriefingSignals: Record<string, unknown>;
  detectedResponseSignals: Record<string, unknown>;
  failedRules: string[];
  immutableFieldsExpected?: Record<string, unknown>;
  immutableFieldsReceived?: Record<string, unknown>;
  immutableFieldMismatches?: string[];
}

@Injectable()
export class CampaignAiService {
  private readonly logger = new Logger(CampaignAiService.name);
  private readonly aiFeature = 'campaign_suggestions';
  private readonly promptVersion = 'campaign-structured-v3.2.0';
  private readonly analysisPromptVersion = 'campaign-copilot-v2.0.0';
  private readonly model: string;
  private readonly apiVersion: string;
  private readonly ai?: GoogleGenAI;
  private readonly defaultModel = 'gemini-2.5-flash';
  private readonly aiTimeoutMs: number;
  private readonly campaignSuggestionMaxOutputTokens: number;
  private readonly isDevelopment: boolean;
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
    @Optional()
    @InjectRepository(Campaign)
    private readonly campaignRepository?: Repository<Campaign>,
    @Optional()
    @InjectRepository(MetricDaily)
    private readonly metricDailyRepository?: Repository<MetricDaily>,
  ) {
    const apiKey = this.readEnv('GEMINI_API_KEY');
    const configuredModel = this.readEnv('GEMINI_MODEL');
    this.apiVersion = this.readEnv('GEMINI_API_VERSION') || 'v1beta';
    this.model = configuredModel && this.supportedModels.has(configuredModel)
      ? configuredModel
      : this.defaultModel;
    this.aiTimeoutMs = Math.max(15000, Number(this.readEnv('GEMINI_TIMEOUT_MS')) || 30000);
    this.campaignSuggestionMaxOutputTokens = Math.max(
      4096,
      Number(this.readEnv('GEMINI_CAMPAIGN_SUGGESTION_MAX_OUTPUT_TOKENS')) || 4096,
    );
    this.isDevelopment = (this.readEnv('NODE_ENV') || this.readEnv('APP_NODE_ENV') || 'development') !== 'production';

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
      const normalizedPrompt = this.normalizePrompt(input.prompt);
      const storeId = this.asString(input.storeId);
      if (!normalizedPrompt || !storeId) {
        throw new UnprocessableEntityException('Prompt e storeId são obrigatórios para sugestão da campanha');
      }
      await this.validateStoreScopeIfPossible(storeId, requester);
      const failure = this.buildAiFailureResponse('missing_api_key', this.promptVersion, this.model);
      this.logAiEvent('Campaign AI unavailable because API key is missing', {
        requestId,
        storeId,
        durationMs: Date.now() - startedAt,
        model: this.model,
        usedFallback: false,
        responseValid: false,
        failureReason: 'missing_api_key',
      });
      return failure;
    }

    const normalizedPrompt = this.normalizePrompt(input.prompt);
    const storeId = this.asString(input.storeId);
    if (!normalizedPrompt || !storeId) {
      throw new UnprocessableEntityException('Prompt e storeId são obrigatórios para sugestão da campanha');
    }

    await this.validateStoreScopeIfPossible(storeId, requester);
    const storeContext = await this.resolveStoreAiContext(storeId, normalizedPrompt, input);
    const campaignIntent = this.buildCampaignIntent(normalizedPrompt, storeContext);
    this.logCampaignIntentResolution(requestId, storeId, normalizedPrompt, storeContext, campaignIntent);
    const modelsToTry = [this.model, ...this.getFallbackModels(this.model)].filter(
      (model, index, list) => model && list.indexOf(model) === index,
    );
    let lastError: unknown = null;
    let lastInvalidResponse: ParsedCampaignSuggestion | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      for (let index = 0; index < modelsToTry.length; index += 1) {
        const model = modelsToTry[index];

        try {
          const geminiResponse = await this.generateGeminiCampaignSuggestionText(
            normalizedPrompt,
            storeContext,
            campaignIntent,
            model,
          );
          const text = geminiResponse.text || geminiResponse.rawText || geminiResponse.candidateText || '';
          const parsed = this.parseCampaignSuggestionJson(
            text,
            geminiResponse.rawText,
            geminiResponse.candidateText,
            geminiResponse.finishReason,
            geminiResponse.maxOutputTokens,
          );

          if (!parsed.error && parsed.payload && typeof parsed.payload === 'object') {
            const response = this.normalizeCampaignSuggestionResponse(
              parsed.payload,
              normalizedPrompt,
              storeContext,
              campaignIntent,
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
      const invalidResponseMessage = lastInvalidResponse.truncated
        ? 'A IA retornou um JSON truncado antes de concluir a sugestão. Gere novamente antes de aplicar qualquer sugestão.'
        : undefined;
      const failure = this.buildAiFailureResponse(
        'invalid_response',
        this.promptVersion,
        this.model,
        this.buildSafeAiFailureDebug(lastInvalidResponse),
        'AI_NEEDS_RETRY',
        invalidResponseMessage,
      );
      this.logAiEvent('Campaign AI failed after invalid model response', {
        requestId,
        storeId,
        durationMs: Date.now() - startedAt,
        model: this.model,
        usedFallback: false,
        responseValid: false,
        failureReason: lastInvalidResponse.error || 'invalid_model_response',
      });
      return failure;
    }

    const reason = this.classifyAiFailureReason(undefined, lastError);
    if (reason === 'timeout' || reason === 'api_error') {
      const failure = this.buildAiFailureResponse(
        reason,
        this.promptVersion,
        this.model,
        undefined,
        'AI_FAILED',
        'A IA não respondeu de forma confiável. Gere novamente antes de aplicar qualquer sugestão.',
      );
      this.logAiEvent('Campaign AI failed after upstream timeout or API error', {
        requestId,
        storeId,
        durationMs: Date.now() - startedAt,
        model: this.model,
        usedFallback: false,
        responseValid: false,
        failureReason: lastError ? this.getGeminiErrorMessage(lastError) : reason,
      });
      return failure;
    }

    const failure = this.buildAiFailureResponse(reason, this.promptVersion, this.model);
    this.logAiEvent('Campaign AI failed', {
      requestId,
      storeId,
      durationMs: Date.now() - startedAt,
      model: this.model,
      usedFallback: false,
      responseValid: false,
      failureReason: lastError ? this.getGeminiErrorMessage(lastError) : 'unknown_ai_failure',
    });
    return failure;
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
      const failure = this.buildAiFailureResponse('missing_api_key', this.analysisPromptVersion, this.model);
      this.logAiEvent('Campaign copilot unavailable because API key is missing', {
        requestId,
        storeId,
        durationMs: Date.now() - startedAt,
        model: this.model,
        usedFallback: false,
        responseValid: false,
        failureReason: 'missing_api_key',
      });
      return failure;
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

        if (parsed.payload && typeof parsed.payload === 'object') {
          const response = this.normalizeCampaignAnalysisResponse(parsed.payload, input, {
            model,
            usedFallback: false,
            responseValid: !parsed.error,
          });
          this.logAiEvent('Campaign copilot analysis generated', {
            requestId,
            storeId,
            durationMs: Date.now() - startedAt,
            model,
            usedFallback: false,
            responseValid: !parsed.error,
            failureReason: parsed.error || undefined,
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
    const failure = this.buildAiFailureResponse(
      this.classifyAiFailureReason(lastInvalidResponse?.error, lastError),
      this.analysisPromptVersion,
      this.model,
    );
    this.logAiEvent('Campaign copilot failed', {
      requestId,
      storeId,
      durationMs: Date.now() - startedAt,
      model: this.model,
      usedFallback: false,
      responseValid: false,
      failureReason,
    });
    return failure;
  }

  private async generateGeminiText(prompt: string, model: string): Promise<string> {
    const response = await this.executeGeminiRequest('legacy_campaign_suggestion', {
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

  private async executeGeminiRequest(
    operation: 'legacy_campaign_suggestion' | 'campaign_suggestion' | 'campaign_analysis',
    requestPayload: {
      model: string;
      contents: string;
      config: Record<string, unknown>;
    },
  ): Promise<GeminiTextResponse> {
    const startedAt = Date.now();
    this.logger.log(JSON.stringify({
      operation,
      stage: 'gemini_request_started',
      timeoutMs: this.aiTimeoutMs,
      payload: this.sanitizeAiLogPayload(requestPayload),
    }));

    try {
      const response = await this.withAiTimeout(
        this.ai!.models.generateContent(requestPayload),
        this.aiTimeoutMs,
      );
      const durationMs = Date.now() - startedAt;
      const rawText = this.extractTextFromGeminiResponse(response);
      const candidateText = this.extractCandidateTextFromGeminiResponse(response);
      const finishReason = this.extractFinishReasonFromGeminiResponse(response);
      const maxOutputTokens = this.extractMaxOutputTokensFromRequestConfig(requestPayload.config);
      const usageMetadata = this.extractUsageMetadataFromGeminiResponse(response);
      this.logger.log(JSON.stringify({
        operation,
        stage: 'gemini_response_received',
        durationMs,
        payload: this.sanitizeAiLogPayload(requestPayload),
        responseText: this.isDevelopment ? this.truncateForLog(rawText) : '[redacted_in_production]',
      }));
      if (this.isDevelopment) {
        this.logger.log(JSON.stringify({
          operation,
          stage: 'gemini_response_debug',
          promptVersion: this.promptVersionForOperation(operation),
          model: requestPayload.model,
          finishReason,
          maxOutputTokens,
          rawTextLength: rawText.length,
          responseTextLength: this.asString((response as { text?: unknown })?.text).length,
          candidateTextLength: candidateText.length,
          candidateTextEndsWithClosingBrace: candidateText.trim().endsWith('}'),
          usageMetadata,
          rawText,
          candidateText,
        }));
      }
      return {
        text: (response as { text?: string }).text || rawText || candidateText || '',
        rawText,
        candidateText,
        finishReason,
        maxOutputTokens,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(JSON.stringify({
        operation,
        stage: 'gemini_request_failed',
        durationMs,
        payload: this.sanitizeAiLogPayload(requestPayload),
        error: this.getErrorDetails(error),
      }));
      throw error;
    }
  }

  private async withAiTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`AI request timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private sanitizeAiLogPayload(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.truncateForLog(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeAiLogPayload(entry));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
          const normalizedKey = key.toLowerCase();
          if (
            normalizedKey === 'contents'
            || normalizedKey === 'prompt'
            || normalizedKey === 'context'
            || normalizedKey === 'responsejsonschema'
          ) {
            return [key, '[redacted]'];
          }

          return [key, this.sanitizeAiLogPayload(entry)];
        }),
      );
    }

    return value;
  }

  private truncateForLog(value: string, maxLength = 4000): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength)}...[truncated]`
      : normalized;
  }

  private promptVersionForOperation(
    operation: 'legacy_campaign_suggestion' | 'campaign_suggestion' | 'campaign_analysis',
  ): string {
    return operation === 'campaign_analysis'
      ? this.analysisPromptVersion
      : this.promptVersion;
  }

  private extractTextFromGeminiResponse(response: unknown): string {
    const directText = this.asString((response as { text?: unknown })?.text);
    if (directText) {
      return directText;
    }

    return this.extractCandidateTextFromGeminiResponse(response);
  }

  private extractCandidateTextFromGeminiResponse(response: unknown): string {
    const candidates = Array.isArray((response as { candidates?: unknown[] })?.candidates)
      ? (response as { candidates?: unknown[] }).candidates as Array<Record<string, unknown>>
      : [];
    const firstCandidate = candidates[0];
    const parts = Array.isArray(firstCandidate?.content && (firstCandidate.content as Record<string, unknown>).parts)
      ? ((firstCandidate.content as Record<string, unknown>).parts as Array<Record<string, unknown>>)
      : [];

    return parts
      .map((part) => this.asString(part?.text))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private extractFinishReasonFromGeminiResponse(response: unknown): string | null {
    const candidates = Array.isArray((response as { candidates?: unknown[] })?.candidates)
      ? (response as { candidates?: unknown[] }).candidates as Array<Record<string, unknown>>
      : [];
    const finishReason = candidates[0]?.finishReason;
    return typeof finishReason === 'string' && finishReason.trim() ? finishReason.trim() : null;
  }

  private extractMaxOutputTokensFromRequestConfig(config: Record<string, unknown>): number | null {
    const value = config?.maxOutputTokens;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private extractUsageMetadataFromGeminiResponse(response: unknown): Record<string, unknown> | null {
    const usage = (response as { usageMetadata?: unknown })?.usageMetadata;
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
      return null;
    }
    return usage as Record<string, unknown>;
  }

  private async generateGeminiCampaignSuggestionText(
    prompt: string,
    storeContext: StoreAiContext,
    campaignIntent: DeterministicCampaignIntent,
    model: string,
  ): Promise<GeminiTextResponse> {
    const requestPayload = {
      model,
      contents: this.buildCampaignSuggestionPrompt(prompt, storeContext, campaignIntent),
      config: {
        temperature: 0.2,
        candidateCount: 1,
        maxOutputTokens: this.campaignSuggestionMaxOutputTokens,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseJsonSchema: this.campaignSuggestionSchema(),
      },
    };
    const response = await this.executeGeminiRequest('campaign_suggestion', requestPayload);

    return {
      ...response,
      text: (response.text || '').trim(),
      rawText: (response.rawText || '').trim(),
      candidateText: (response.candidateText || '').trim(),
    };
  }

  private async generateGeminiCampaignAnalysisText(
    input: CampaignCopilotAnalysisRequest,
    storeContext: StoreAiContext,
    model: string,
  ): Promise<string> {
    const requestPayload = {
      model,
      contents: this.buildStrategicCampaignAnalysisPrompt(input, storeContext),
      config: {
        temperature: 0.2,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
        responseJsonSchema: this.campaignAnalysisSchema(),
      },
    };
    const response = await this.executeGeminiRequest('campaign_analysis', requestPayload);

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
    tenantBusinessName?: string | null;
    managerNotes?: string | null;
    tenantNotes?: string | null;
    tenantWebsite?: string | null;
    tenantInstagram?: string | null;
    tenantWhatsapp?: string | null;
    tenantDefaultCity?: string | null;
    tenantDefaultState?: string | null;
    tenantBusinessType?: string | null;
    tenantAccountType?: string | null;
    historicalContext?: StoreAiContext['historicalContext'];
    hasConnectedMetaAccount?: boolean;
    hasConnectedPage?: boolean;
  }): StoreAiContext {
    const storeName = this.asString(input.storeName) || 'Store não identificada';
    const managerName = this.asString(input.managerName) || null;
    const tenantName = this.asString(input.tenantName) || null;
    const tenantBusinessName = this.asString(input.tenantBusinessName) || null;
    const managerNotes = this.asString(input.managerNotes);
    const tenantNotes = this.asString(input.tenantNotes);
    const tenantWebsite = this.asNullableString(input.tenantWebsite);
    const tenantInstagram = this.asNullableString(input.tenantInstagram);
    const tenantWhatsapp = this.asNullableString(input.tenantWhatsapp);
    const tenantDefaultCity = this.asNullableString(input.tenantDefaultCity);
    const tenantDefaultState = this.asNullableString(input.tenantDefaultState);
    const tenantBusinessType = this.asNullableString(input.tenantBusinessType);
    const tenantAccountType = this.asNullableString(input.tenantAccountType);
    const commercialInput = input.input;
    const promptBriefing = this.extractPromptBriefing(input.prompt);
    const extraContext = this.asString(commercialInput?.extraContext);
    const inputPrimaryOffer = this.asString(commercialInput?.primaryOffer);
    const inferredExtraContextOffer = this.inferMainOffer(extraContext);
    const primaryOffer = this.firstSpecificText(
      promptBriefing.primaryOffer,
      inputPrimaryOffer,
      inferredExtraContextOffer,
    );
    const region = this.firstSpecificText(
      promptBriefing.region,
      commercialInput?.region,
      tenantDefaultState,
    );
    const city = this.firstSpecificText(
      promptBriefing.city,
      this.inferCityText(extraContext),
      tenantDefaultCity,
    ) || null;
    const historicalContext = input.historicalContext || {
      campaignCount: 0,
      recentCampaigns: [],
      metrics: { ctr: null, cpa: null, roas: null },
      audienceSignals: [],
    };
    const sourceText = [
      input.prompt,
      extraContext,
      primaryOffer,
      region,
      storeName,
      managerName,
      tenantName,
      tenantBusinessName,
      tenantNotes,
      managerNotes,
      tenantWebsite,
      tenantInstagram,
      tenantWhatsapp,
      tenantDefaultCity,
      tenantDefaultState,
      tenantBusinessType,
      ...historicalContext.audienceSignals,
    ].filter(Boolean).join('\n');
    const companyName = this.firstSpecificText(tenantBusinessName, storeName, tenantName, managerName) || 'Store não identificada';
    const tenantInferredSegment = this.inferStoreSegment([
      tenantBusinessType,
      tenantNotes,
      managerNotes,
      tenantBusinessName,
      storeName,
    ].filter(Boolean).join('\n'));
    const inferredPromptVertical = this.inferVertical(input.prompt);
    const segment = this.firstSpecificText(
      promptBriefing.segment,
      tenantInferredSegment !== 'campanha comercial' ? tenantInferredSegment : '',
      inferredPromptVertical !== 'negócio' ? inferredPromptVertical : '',
    ) || 'campanha comercial';
    const promptBusinessType = promptBriefing.segment
      ? this.inferBusinessType(input.prompt, promptBriefing.segment)
      : '';
    const businessType = this.firstSpecificText(
      promptBusinessType,
      tenantBusinessType,
      this.inferBusinessType(sourceText, segment),
    ) || 'operação comercial';
    const description = this.firstSpecificText(tenantNotes, managerNotes)
      || `Empresa ${companyName} no segmento ${segment}, com operação de ${businessType}.`;
    const targetAudience = this.inferTargetAudience(sourceText, segment, businessType);
    const salesModel = this.inferSalesModel(sourceText, businessType);
    const notesSummary = this.summarizeNotes([tenantNotes, managerNotes, extraContext].filter(Boolean).join(' '));
    const differentiators = this.inferDifferentiators(sourceText);
    const contextSources = [
      this.asString(input.storeName) ? 'store.name' : '',
      tenantName ? 'tenant.name' : '',
      tenantBusinessName ? 'tenant.businessName' : '',
      managerName ? 'manager.name' : '',
      tenantNotes ? 'tenant.notes' : '',
      managerNotes ? 'manager.notes' : '',
      tenantWebsite ? 'tenant.website' : '',
      tenantInstagram ? 'tenant.instagram' : '',
      tenantWhatsapp ? 'tenant.whatsapp' : '',
      tenantDefaultCity ? 'tenant.defaultCity' : '',
      tenantDefaultState ? 'tenant.defaultState' : '',
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
      website: tenantWebsite,
      instagram: tenantInstagram,
      whatsapp: tenantWhatsapp,
      targetAudience,
      businessType,
      managerName,
      tenantName,
      tenantNotes: tenantNotes || null,
      managerNotes: managerNotes || null,
      contextSources,
      storeProfile: {
        name: companyName,
        segment,
        businessType,
        city,
        region: region || null,
        instagram: tenantInstagram,
        whatsapp: tenantWhatsapp,
        salesModel,
        mainOffer: primaryOffer || null,
        targetAudienceBase: targetAudience,
        differentiators,
        notesSummary,
      },
      tenantProfile: {
        businessType: tenantBusinessType,
        notes: tenantNotes || null,
        accountType: tenantAccountType,
      },
      managerProfile: {
        notes: managerNotes || null,
      },
      campaignIntent: {
        goal: this.firstSpecificText(
          promptBriefing.goal,
          commercialInput?.goal,
          this.inferFallbackObjective(input.prompt),
        ),
        funnelStage: this.firstSpecificText(
          promptBriefing.funnelStage,
          this.normalizeFunnelStage(commercialInput?.funnelStage, input.prompt),
        ) || null,
        channelPreference: this.firstSpecificText(
          promptBriefing.channelPreference,
          this.normalizeCommercialDestinationType(commercialInput?.destinationType),
          this.inferChannelPreference(input.prompt),
        ),
        budgetRange: this.formatBudgetRange(commercialInput?.budget, input.prompt),
        durationDays: this.normalizePositiveNumber(commercialInput?.durationDays),
        destinationType: this.firstSpecificText(
          promptBriefing.destinationType,
          this.normalizeCommercialDestinationType(commercialInput?.destinationType),
          this.resolveCampaignIntentDestinationType(undefined, extraContext),
        ) || null,
        primaryOffer: primaryOffer || null,
        region: region || null,
        extraContext: extraContext || null,
        communicationTone: this.inferCommunicationTone(sourceText, businessType),
      },
      historicalContext,
      dataAvailability: {
        hasHistoricalCampaigns: historicalContext.campaignCount > 0,
        hasPerformanceMetrics: historicalContext.metrics.ctr !== null
          || historicalContext.metrics.cpa !== null
          || historicalContext.metrics.roas !== null,
        hasConnectedMetaAccount: !!input.hasConnectedMetaAccount,
        hasConnectedPage: !!input.hasConnectedPage,
        hasWebsite: !!tenantWebsite,
        hasWhatsapp: !!tenantWhatsapp,
        hasInstagram: !!tenantInstagram,
        hasMessageDestinationAvailable: !!(input.hasConnectedPage || tenantWhatsapp || tenantInstagram),
      },
      fieldOrigins: {
        segment: promptBriefing.segment
          ? 'prompt'
          : tenantInferredSegment !== 'campanha comercial'
          ? 'tenant_default'
          : inferredPromptVertical !== 'negócio'
          ? 'backend_inference'
          : 'fallback',
        businessType: promptBusinessType
          ? 'prompt'
          : tenantBusinessType
          ? 'tenant_default'
          : 'backend_inference',
        city: promptBriefing.city
          ? 'prompt'
          : this.inferCityText(extraContext)
          ? 'input'
          : tenantDefaultCity
          ? 'tenant_default'
          : null,
        region: promptBriefing.region
          ? 'prompt'
          : commercialInput?.region
          ? 'input'
          : tenantDefaultState
          ? 'tenant_default'
          : null,
        goal: promptBriefing.goal
          ? 'prompt'
          : commercialInput?.goal
          ? 'input'
          : 'backend_inference',
        funnelStage: promptBriefing.funnelStage
          ? 'prompt'
          : commercialInput?.funnelStage
          ? 'input'
          : this.normalizeFunnelStage(undefined, input.prompt)
          ? 'backend_inference'
          : null,
        budget: promptBriefing.budget
          ? 'prompt'
          : this.normalizePositiveNumber(commercialInput?.budget)
          ? 'input'
          : null,
        destinationType: promptBriefing.destinationType
          ? 'prompt'
          : this.normalizeCommercialDestinationType(commercialInput?.destinationType)
          ? 'input'
          : this.resolveCampaignIntentDestinationType(undefined, extraContext)
          ? 'input'
          : null,
        channelPreference: promptBriefing.channelPreference
          ? 'prompt'
          : this.normalizeCommercialDestinationType(commercialInput?.destinationType)
          ? 'input'
          : this.inferChannelPreference(input.prompt)
          ? 'backend_inference'
          : null,
        primaryOffer: promptBriefing.primaryOffer
          ? 'prompt'
          : inputPrimaryOffer
          ? 'input'
          : inferredExtraContextOffer
          ? 'input'
          : null,
        extraContext: extraContext ? 'input' : null,
      },
    };
  }

  private async resolveStoreAiContext(
    storeId: string,
    prompt: string,
    input?: CampaignAiRequest,
  ): Promise<StoreAiContext> {
    const integrationSignals = await this.resolveIntegrationSignals(storeId);
    const historicalContext = await this.resolveHistoricalContext(storeId);
    const fallback = this.buildStoreAiContextFromMetadata({
      storeId,
      prompt,
      input,
      storeName: 'Store não identificada',
      historicalContext,
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
          tenantBusinessName: store.tenant?.businessName || null,
          managerNotes: store.manager?.notes || null,
          tenantNotes: store.tenant?.notes || null,
          tenantWebsite: store.tenant?.website || null,
          tenantInstagram: store.tenant?.instagram || null,
          tenantWhatsapp: store.tenant?.whatsapp || null,
          tenantDefaultCity: store.tenant?.defaultCity || null,
          tenantDefaultState: store.tenant?.defaultState || null,
          tenantBusinessType: store.tenant?.businessSegment || null,
          tenantAccountType: store.tenant?.accountType || null,
          historicalContext,
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

  private async resolveHistoricalContext(storeId: string): Promise<StoreAiContext['historicalContext']> {
    const emptyContext: StoreAiContext['historicalContext'] = {
      campaignCount: 0,
      recentCampaigns: [],
      metrics: {
        ctr: null,
        cpa: null,
        roas: null,
      },
      audienceSignals: [],
    };

    if (!this.campaignRepository) {
      return emptyContext;
    }

    try {
      const recentCampaigns = await this.campaignRepository.find({
        where: { storeId },
        order: { createdAt: 'DESC' },
        take: 6,
      });

      const metricAggregate = this.metricDailyRepository
        ? await this.metricDailyRepository
          .createQueryBuilder('metric')
          .innerJoin(Campaign, 'campaign', 'campaign.id = metric.campaignId')
          .select('AVG(metric.ctr)', 'avgCtr')
          .addSelect('AVG(metric.cpa)', 'avgCpa')
          .addSelect('AVG(metric.roas)', 'avgRoas')
          .where('campaign.storeId = :storeId', { storeId })
          .getRawOne<{ avgCtr?: string | null; avgCpa?: string | null; avgRoas?: string | null }>()
        : null;

      const audienceSignals = Array.from(new Set(
        recentCampaigns
          .flatMap((campaign) => [
            campaign.objective ? `Histórico com objetivo ${campaign.objective}.` : '',
            campaign.dailyBudget ? `Faixa recorrente de orçamento perto de R$ ${Math.round(Number(campaign.dailyBudget))}.` : '',
            campaign.score ? `Score histórico observado em torno de ${Math.round(Number(campaign.score))}.` : '',
          ])
          .filter(Boolean),
      )).slice(0, 5);

      return {
        campaignCount: recentCampaigns.length,
        recentCampaigns: recentCampaigns.map((campaign) => ({
          name: campaign.name,
          objective: campaign.objective,
          dailyBudget: campaign.dailyBudget !== null ? Number(campaign.dailyBudget) : null,
          score: campaign.score !== null ? Number(campaign.score) : null,
          status: campaign.status || null,
        })),
        metrics: {
          ctr: this.parseAggregateMetric(metricAggregate?.avgCtr),
          cpa: this.parseAggregateMetric(metricAggregate?.avgCpa),
          roas: this.parseAggregateMetric(metricAggregate?.avgRoas),
        },
        audienceSignals,
      };
    } catch (error) {
      this.logger.warn(`Unable to load historical AI context for ${storeId}: ${this.getErrorDetails(error)}`);
      return emptyContext;
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

  private firstSpecificText(...values: unknown[]): string {
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

  private buildCampaignSuggestionPrompt(
    prompt: string,
    storeContext: StoreAiContext,
    campaignIntent: DeterministicCampaignIntent,
  ): string {
    const compactContext = {
      companyName: storeContext.companyName || null,
      segment: storeContext.segment || null,
      businessType: storeContext.businessType || null,
      description: storeContext.description || null,
      targetAudience: storeContext.targetAudience || null,
      website: storeContext.website || null,
      instagram: storeContext.instagram || null,
      whatsapp: storeContext.whatsapp || null,
      storeProfile: {
        city: storeContext.storeProfile.city || null,
        region: storeContext.storeProfile.region || null,
        salesModel: storeContext.storeProfile.salesModel || null,
        mainOffer: storeContext.storeProfile.mainOffer || null,
        differentiators: storeContext.storeProfile.differentiators.slice(0, 4),
      },
      campaignIntent,
      historicalContext: {
        campaignCount: storeContext.historicalContext?.campaignCount || 0,
        audienceSignals: (storeContext.historicalContext?.audienceSignals || []).slice(0, 4),
      },
      dataAvailability: storeContext.dataAvailability,
    };

    return [
      'Retorne APENAS JSON minificado em uma unica linha, sem markdown e sem texto fora do JSON.',
      'Nao invente metricas, historico, benchmark, promessas, publico, orcamento, objetivo ou CTA fora do que o contexto sustenta.',
      'Use null ou [] quando nao souber.',
      'Campos obrigatorios: strategy, planner, campaign, adSet, creative, review, validation.',
      'Regras: campaign.objective=OUTCOME_TRAFFIC|OUTCOME_LEADS|REACH|null; campaign.buyingType=AUCTION; campaign.status=PAUSED; campaign.budget.type=daily|lifetime|null; campaign.budget.amount=number|null; campaign.budget.currency=BRL; creative.primaryText<=260; creative.headline<=80; creative.description<=120; creative.cta nao vazio; creative.destinationUrl=https:// ou null; adSet.targeting.country=ISO-2 ou null; adSet.targeting.stateCode=UF ou null; adSet.targeting.interests=array curto; review.confidence=0..100; validation.qualityScore=0..100; validation.isReadyToPublish=false se houver blockingIssues.',
      `Contrato deterministico: use exatamente objective=${campaignIntent.objective || 'null'}; destinationType=${campaignIntent.destinationType || 'null'}; cta=${campaignIntent.cta || 'null'}; budgetAmount=${campaignIntent.budgetAmount ?? 'null'}; budgetType=${campaignIntent.budgetType || 'null'}; funnelStage=${campaignIntent.funnelStage || 'null'}.`,
      'Campos de controle imutáveis: objective, budget, budgetType, cta, destinationType, segment, storeId, campaignType. NUNCA altere esses campos.',
      'Nao altere campos de controle. Gere apenas textos, audiencia, recomendacoes e explicacoes compativeis com esse contrato.',
      'Se destinationType=messages, nao exija URL de site e nao invente destinationUrl https.',
      'Se destinationType=site, destinationUrl HTTPS é obrigatório e a IA nunca pode retornar mensagens/WhatsApp para uma campanha de site.',
      'Se remarketingExpected=true, descreva publico quente realista e nao invente pixel, audiencia ou infraestrutura inexistente.',
      `Contexto:${JSON.stringify(compactContext)}`,
      `Briefing:${JSON.stringify(prompt)}`,
    ].join(' ');

    return `
Você é um assistente de criação de campanhas para a Nexora.

Sua função é gerar uma campanha inicial estruturada, útil, específica e segura com base apenas nos dados fornecidos.
Você NÃO é um analista de performance nesta etapa.
Você NÃO deve inventar métricas, preços, promessas, garantias, histórico, benchmark ou fatos não fornecidos.

Responda APENAS JSON válido.
NUNCA use markdown.
NUNCA explique fora do JSON.

Formato obrigatório:
{
  "strategy": "string",
  "primaryText": "string",
  "headline": "string",
  "description": "string",
  "cta": "string",
  "audience": {
    "gender": "all | male | female | null",
    "ageRange": "string | null",
    "interests": ["string"]
  },
  "budgetSuggestion": "number | null",
  "risks": ["string"],
  "improvements": ["string"],
  "reasoning": ["string"],
  "explanation": {
    "strategy": "string",
    "audience": "string",
    "copy": "string",
    "budget": "string"
  },
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
- Trate esta saída como campanha inicial para uma empresa real de pequeno ou médio porte. Evite linguagem vaga de consultoria.
- strategy deve resumir a linha mestra da campanha em linguagem humana e sem jargão excessivo.
- primaryText, headline, description e cta não podem vir vazios.
- NÃO use copy genérica com palavras vagas como "produto", "serviço", "solução", "negócio", "empresa", "qualidade" ou "atendimento" sem qualificadores concretos.
- Sempre que houver contexto suficiente, cite a oferta principal, a cidade/região, o canal de destino e o diferencial real da operação.
- Se faltar contexto crítico para deixar a copy específica, registre a lacuna em planner.missingInputs e review.risks em vez de preencher com texto genérico.
- audience deve explicar gênero, faixa etária e interesses em formato útil para preenchimento do builder.
- budgetSuggestion deve repetir a recomendação de orçamento principal.
- risks, improvements e reasoning devem ser específicos ao contexto real da store e do briefing.
- explanation.strategy, explanation.audience, explanation.copy e explanation.budget devem responder "por que essa campanha?" de forma simples.
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
- creative.primaryText, creative.headline e creative.description devem soar compatíveis com Meta Ads para pequenos negócios: simples, claros, específicos e sem promessas absolutas.
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

Seções que você deve considerar explicitamente:
1. contexto da empresa
2. objetivo da campanha
3. público esperado
4. tipo de produto
5. diferencial
6. tom de comunicação

Contexto da empresa:
${JSON.stringify({
      companyName: storeContext.companyName,
      segment: storeContext.segment,
      description: storeContext.description,
      website: storeContext.website,
      instagram: storeContext.instagram,
      whatsapp: storeContext.whatsapp,
      storeName: storeContext.storeName,
      tenantName: storeContext.tenantName,
      managerName: storeContext.managerName,
      storeProfile: storeContext.storeProfile,
    }, null, 2)}

Objetivo da campanha:
${JSON.stringify(storeContext.campaignIntent, null, 2)}

Público esperado:
${JSON.stringify({
      targetAudience: storeContext.targetAudience,
      audienceSignals: storeContext.historicalContext?.audienceSignals || [],
    }, null, 2)}

Tipo de produto:
${JSON.stringify({
      primaryOffer: storeContext.campaignIntent.primaryOffer,
      salesModel: storeContext.storeProfile.salesModel,
      recentCampaigns: storeContext.historicalContext?.recentCampaigns || [],
    }, null, 2)}

Diferencial:
${JSON.stringify({
      differentiators: storeContext.storeProfile.differentiators,
      notesSummary: storeContext.storeProfile.notesSummary,
      tenantNotes: storeContext.tenantNotes,
      managerNotes: storeContext.managerNotes,
    }, null, 2)}

Tom de comunicação:
${JSON.stringify({
      tone: storeContext.campaignIntent.communicationTone,
      businessType: storeContext.businessType,
    }, null, 2)}

Dados históricos:
${JSON.stringify(storeContext.historicalContext || {
      campaignCount: 0,
      recentCampaigns: [],
      metrics: { ctr: null, cpa: null, roas: null },
      audienceSignals: [],
    }, null, 2)}

Disponibilidade operacional:
${JSON.stringify(storeContext.dataAvailability, null, 2)}

Prompt version: ${this.promptVersion}

Briefing:
${prompt}
    `.trim();
  }

  private buildCampaignAnalysisPrompt(
    input: CampaignCopilotAnalysisRequest,
    storeContext: StoreAiContext,
  ): string {
    return `
Você é o copiloto de campanha da Nexora.

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

  private buildStrategicCampaignAnalysisPrompt(
    input: CampaignCopilotAnalysisRequest,
    storeContext: StoreAiContext,
  ): string {
    const analysisContext = {
      companyName: storeContext.companyName,
      segment: storeContext.segment,
      businessType: storeContext.businessType,
      targetAudience: storeContext.targetAudience,
      dataAvailability: storeContext.dataAvailability,
      tenantNotes: storeContext.tenantProfile?.notes || null,
      managerNotes: storeContext.managerProfile?.notes || null,
      historicalContext: storeContext.historicalContext || null,
    };

    const campaignPayload = {
      campaign: input.campaign,
      adSet: input.adSet || {},
      creative: input.creative || {},
      targeting: input.targeting || {},
      budget: input.budget || {},
      location: input.location || {},
      objective: input.objective || null,
      cta: input.cta || null,
      destinationUrl: input.destinationUrl || null,
    };

    return `
Você é a IA estratégica principal da Nexora.

Sua função não é apenas preencher campos.
Sua função é atuar como um copiloto sênior de performance de marketing para impedir campanhas ruins, reduzir desperdício financeiro, aumentar a segurança operacional e decidir se uma campanha deve ou não deve ser publicada.

Pergunta principal:
Essa campanha deve ou não deve ser publicada?

Regras absolutas:
- Nunca invente informações.
- Nunca assuma dados não fornecidos.
- Nunca invente CTR, CPC, CPA, ROAS, conversão, benchmark, taxa ou projeção.
- Se faltar contexto crítico, deixe isso explícito em warnings, blockingIssues ou recommendations usando a ideia de informação insuficiente para validação segura.
- Priorize segurança financeira. Se o risco for alto, bloqueie ou mande revisar.
- Não seja otimista por padrão.
- Quando existir regra objetiva, a regra prevalece.

Escopo oficial do Meta Publisher atual:
- O publish automático atual suporta apenas campanhas de website.
- Website com destinationUrl em HTTPS pode ser candidato a publish automático.
- WhatsApp, Messenger, Instagram DM e campanhas reais de mensagens ainda não são suportados end-to-end para publicação automática.
- Se a campanha for de mensagens, ela pode receber estratégia, estrutura, copy e CTA compatível, mas não pode ser marcada como pronta para publish automático.
- Se detectar destinationType/messages, WhatsApp, Messenger ou Instagram DM como destino real, marque isReadyToPublish=false e use REVIEW ou BLOCK conforme a gravidade.

Analise obrigatoriamente:
1. Diagnóstico de negócio: tipo de empresa, maturidade, urgência, ticket, recorrência, dificuldade de conversão, dependência de confiança, lead ideal, concorrência e sensibilidade a preço.
2. Risco de prejuízo: verba incompatível, oferta fraca, criativo fraco, CTA ruim, público desalinhado, copy fraca, funil ruim, landing ruim, baixa chance de conversão e risco de lead desqualificado.
3. Risco de reprovação Meta: claims agressivas, promessa sensível, segmentação problemática, criativo inadequado, copy com risco de reprovação e estrutura fraca.
4. Potencial de performance: chance relativa de CTR saudável, CPC competitivo, CPA viável, escala e otimização futura, sem usar números inventados.
5. Recomendação executiva: publicar, bloquear, revisar ou reestruturar.

Regras objetivas que devem bloquear ou rebaixar severamente a campanha quando aplicáveis:
- orçamento zerado ou inválido
- destinationUrl ausente ou inválida em campanha de website
- headline ausente
- copy principal ausente
- CTA ausente
- oferta pouco clara
- tracking/pixel claramente ausente quando o objetivo depende disso
- campanha de mensagens marcada como pronta para publish automático

Responda APENAS JSON válido.
NUNCA use markdown.
NUNCA explique fora do JSON.

Formato obrigatório:
{
  "overallScore": 0,
  "riskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
  "isReadyToPublish": false,
  "businessDiagnosis": {
    "summary": "",
    "mainProblem": "",
    "mainOpportunity": ""
  },
  "blockingIssues": [""],
  "warnings": [""],
  "recommendations": [""],
  "performanceAnalysis": {
    "conversionPotential": "",
    "financialRisk": "",
    "metaApprovalRisk": "",
    "scalabilityPotential": ""
  },
  "executiveDecision": {
    "decision": "PUBLISH | BLOCK | REVIEW | RESTRUCTURE",
    "reason": ""
  }
}

Contexto da store:
${JSON.stringify(analysisContext, null, 2)}

Campanha estruturada:
${JSON.stringify(campaignPayload, null, 2)}
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
      required: ['strategy', 'planner', 'campaign', 'adSet', 'creative', 'review', 'validation'],
      properties: {
        strategy: { type: 'string', minLength: 1 },
        planner: {
          type: 'object',
          additionalProperties: false,
          required: ['goal', 'funnelStage', 'audienceIntent', 'missingInputs', 'assumptions'],
          properties: {
            goal: { type: ['string', 'null'] },
            funnelStage: { type: ['string', 'null'], enum: ['top', 'middle', 'bottom', null] },
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
          required: ['primaryText', 'headline', 'description', 'cta', 'destinationUrl'],
          properties: {
            primaryText: { type: ['string', 'null'] },
            headline: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            cta: { type: ['string', 'null'] },
            destinationUrl: { type: ['string', 'null'] },
          },
        },
        review: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'risks', 'recommendations', 'confidence'],
          properties: {
            summary: { type: 'string', minLength: 1 },
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
      required: [
        'overallScore',
        'riskLevel',
        'isReadyToPublish',
        'businessDiagnosis',
        'blockingIssues',
        'warnings',
        'recommendations',
        'performanceAnalysis',
        'executiveDecision',
      ],
      properties: {
        overallScore: { type: 'number' },
        riskLevel: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        },
        isReadyToPublish: { type: 'boolean' },
        businessDiagnosis: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'mainProblem', 'mainOpportunity'],
          properties: {
            summary: { type: 'string', minLength: 1 },
            mainProblem: { type: 'string' },
            mainOpportunity: { type: 'string' },
          },
        },
        blockingIssues: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
        performanceAnalysis: {
          type: 'object',
          additionalProperties: false,
          required: ['conversionPotential', 'financialRisk', 'metaApprovalRisk', 'scalabilityPotential'],
          properties: {
            conversionPotential: { type: 'string' },
            financialRisk: { type: 'string' },
            metaApprovalRisk: { type: 'string' },
            scalabilityPotential: { type: 'string' },
          },
        },
        executiveDecision: {
          type: 'object',
          additionalProperties: false,
          required: ['decision', 'reason'],
          properties: {
            decision: {
              type: 'string',
              enum: ['PUBLISH', 'BLOCK', 'REVIEW', 'RESTRUCTURE'],
            },
            reason: { type: 'string' },
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
    campaignIntent?: DeterministicCampaignIntent,
    metadata: { model?: string; usedFallback?: boolean; responseValid?: boolean } = {},
  ): CampaignSuggestionResponse {
    const constraints = this.buildBriefingConstraintsPrioritizingPrompt(prompt, storeContext);
    const intent = campaignIntent || this.buildCampaignIntent(prompt, storeContext);
    const normalizedPayload = this.normalizeCampaignAiResponse(payload) as Record<string, any>;
    const normalizedPlanner = this.firstObject(normalizedPayload.planner);
    const normalizedCampaign = this.firstObject(normalizedPayload.campaign);
    const normalizedAdSet = this.firstObject(normalizedPayload.adSet);
    const normalizedCreative = this.firstObject(normalizedPayload.creative);
    const normalizedReview = this.firstObject(normalizedPayload.review);
    const vertical = this.inferVertical([
      prompt,
      storeContext?.segment,
      storeContext?.description,
      storeContext?.businessType,
    ].filter(Boolean).join(' '));
    const segment = this.firstSpecificText(storeContext?.segment) || vertical;
    const normalizedAssumptions = this.normalizeStringArray(normalizedPlanner.assumptions).length
      ? this.normalizeStringArray(normalizedPlanner.assumptions)
      : this.buildFallbackAssumptions(segment, storeContext);
    const normalizedMissingInputs = this.normalizeStringArray(normalizedPlanner.missingInputs).length
      ? this.normalizeStringArray(normalizedPlanner.missingInputs)
      : this.buildFallbackMissingInputs(prompt, storeContext);
    const normalizedRisks = this.normalizeStringArray(normalizedReview.risks).length
      ? this.normalizeStringArray(normalizedReview.risks)
      : this.buildFallbackRiskWarnings(metadata.usedFallback, normalizedMissingInputs);
    const normalizedStrengths = this.normalizeStringArray(normalizedReview.strengths).length
      ? this.normalizeStringArray(normalizedReview.strengths)
      : this.buildKnownFacts(storeContext, prompt);
    const normalizedRecommendations = this.normalizeStringArray(normalizedReview.recommendations).length
      ? this.normalizeStringArray(normalizedReview.recommendations)
      : [
          this.buildFallbackDestinationRecommendation(prompt, storeContext),
          this.buildFallbackBudgetRationale(prompt, storeContext),
          ...this.buildFallbackNextDataNeeded().slice(0, 2),
        ].filter(Boolean);
    const messageIntent = intent.destinationType === 'messages';
    const objective = intent.objective || this.normalizeStructuredObjective(normalizedCampaign.objective, prompt);
    const funnelStage = this.normalizeStructuredFunnelStage(
      normalizedPlanner.funnelStage ?? storeContext?.campaignIntent.funnelStage,
      prompt,
    );
    const budget = this.normalizeStructuredBudget(
      normalizedCampaign.budget ?? normalizedPayload.budgetSuggestion ?? normalizedPayload.budget,
      prompt,
    );
    const normalizedCampaignName = this.normalizeOptionalStructuredText(normalizedCampaign.campaignName, 80) || '';
    const primaryText = this.normalizeOptionalStructuredText(normalizedCreative.primaryText, 260) || '';
    const headline = this.normalizeOptionalStructuredText(normalizedCreative.headline, 80) || '';
    const audienceIntent = this.normalizeOptionalStructuredText(normalizedPlanner.audienceIntent, 260) || '';
    const description = this.normalizeOptionalStructuredText(normalizedCreative.description, 120);
    const cta = intent.cta || (messageIntent ? 'MESSAGE_PAGE' : this.normalizeStructuredCta(normalizedCreative.cta));
    const destinationUrl = intent.destinationType === 'site'
      ? this.normalizeHttpsUrl(normalizedCreative.destinationUrl) || this.normalizeHttpsUrl(storeContext?.website)
      : null;
    const targeting = this.normalizeStructuredTargeting(normalizedAdSet.targeting, prompt);
    const remarketingAudienceGuard = this.sanitizeAudienceForRemarketing(
      targeting,
      constraints,
      audienceIntent,
    );
    const planner: AiPlannerOutput = {
      businessType: this.normalizeOptionalStructuredText(
        normalizedPlanner.businessType,
        120,
      ) || this.normalizeOptionalStructuredText(storeContext?.businessType, 120),
      goal: this.normalizeOptionalStructuredText(
        normalizedPlanner.goal,
        160,
      ) || this.normalizeOptionalStructuredText(storeContext?.campaignIntent.goal, 160),
      funnelStage,
      offer: this.normalizeOptionalStructuredText(
        normalizedPlanner.offer,
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
      budget: {
        ...budget,
        type: intent.budgetType || budget.type,
        amount: intent.budgetAmount ?? budget.amount,
      },
    };
    const adSet: AiAdSetOutput = {
      name: this.normalizeOptionalStructuredText(normalizedAdSet.name, 120) || '',
      optimizationGoal: this.normalizeOptionalStructuredText(
        normalizedAdSet.optimizationGoal,
        80,
      ) || this.buildFallbackOptimizationGoal(objective),
      billingEvent: this.normalizeOptionalStructuredText(
        normalizedAdSet.billingEvent,
        80,
      ) || this.buildFallbackBillingEvent(objective),
      targeting: remarketingAudienceGuard.targeting,
    };
    const creative: AiCreativeOutput = {
      name: this.normalizeOptionalStructuredText(normalizedCreative.name, 120) || '',
      primaryText,
      headline,
      description,
      cta,
      imageSuggestion: this.normalizeOptionalStructuredText(
        normalizedCreative.imageSuggestion,
        220,
      ) || null,
      destinationUrl,
    };
    const review: AiReviewOutput = {
      summary: this.normalizeStructuredText(
        normalizedReview.summary,
        this.buildFallbackCampaignAngle(segment, prompt, storeContext),
        320,
      ),
      strengths: normalizedStrengths,
      risks: normalizedRisks,
      recommendations: normalizedRecommendations,
      confidence: this.normalizeConfidenceScore(normalizedReview.confidence)
        ?? this.inferConfidenceScore(normalizedMissingInputs, normalizedAssumptions, storeContext),
    };
    const validation = this.normalizeValidationOutput(
      normalizedPayload?.validation,
      { planner, campaign, adSet, creative, review, strategy: this.asString(normalizedPayload?.strategy) },
      storeContext,
      metadata,
    );
    const strategy = this.normalizeStructuredText(
      normalizedPayload?.strategy,
      this.buildFallbackStrategy(segment, storeContext),
      260,
    );
    const rootPrimaryText = this.normalizeOptionalStructuredText(normalizedPayload?.primaryText, 260)
      || creative.primaryText
      || '';
    const rootHeadline = this.normalizeOptionalStructuredText(normalizedPayload?.headline, 80)
      || creative.headline
      || '';
    const rootDescription = this.normalizeOptionalStructuredText(normalizedPayload?.description, 120)
      || creative.description
      || '';
    const rootCta = (intent.cta || (messageIntent ? 'MESSAGE_PAGE' : this.normalizeCtaValue(normalizedPayload?.cta)))
      || creative.cta
      || '';
    const reasoning = this.normalizeStringArrayUnique(
      Array.isArray(normalizedPayload?.reasoning) ? normalizedPayload.reasoning : this.buildFallbackReasoningLines(storeContext, planner, campaign, adSet, creative),
      6,
    );
    const improvements = this.normalizeStringArrayUnique(
      Array.isArray(normalizedPayload?.improvements) ? normalizedPayload.improvements : validation.recommendations,
      6,
    );
    const risks = this.normalizeStringArrayUnique(
      Array.isArray(normalizedPayload?.risks) ? normalizedPayload.risks : review.risks,
      6,
    );
    const explanation = this.normalizeExplanationOutput(
      normalizedPayload?.explanation,
      storeContext,
      planner,
      campaign,
      adSet,
      creative,
      strategy,
    );
    const rawAudienceSummary = this.normalizeAudienceSummary(normalizedPayload?.audience, adSet.targeting);
    const audienceSummary = remarketingAudienceGuard.sanitized
      ? {
        ...rawAudienceSummary,
        interests: [],
      }
      : rawAudienceSummary;
    const completenessImprovements = this.buildCampaignSuggestionCompletenessImprovements(normalizedPayload);
    const degradedResponseRisk = metadata.responseValid === false
      ? ['A resposta da IA exige revisão manual antes da publicação.']
      : [];
    const effectiveConfidence = metadata.responseValid === false
      ? Math.min(review.confidence, 45)
      : review.confidence;
    const consistency = this.postProcessConsistencyForRemarketing(
      this.validateSuggestionConsistency(
        constraints,
        {
          strategy,
          primaryText: rootPrimaryText,
          headline: rootHeadline,
          description: rootDescription,
          cta: rootCta,
          audience: audienceSummary,
          planner,
          campaign,
          adSet,
          creative,
        },
        normalizedPayload,
      ),
      constraints,
      remarketingAudienceGuard.sanitized,
    );
    const mergedBlockingIssues = this.normalizeStringArrayUnique(
      [...validation.blockingIssues, ...consistency.blockingIssues],
      8,
    );
    const mergedWarnings = this.normalizeStringArrayUnique(
      [...validation.warnings, ...consistency.warnings, ...remarketingAudienceGuard.warnings],
      8,
    );
    const mergedRecommendations = this.normalizeStringArrayUnique(
      [
        ...validation.recommendations,
        ...consistency.recommendations,
        ...remarketingAudienceGuard.recommendations,
        ...completenessImprovements,
      ],
      8,
    );
    const responseValid = metadata.responseValid === undefined ? true : metadata.responseValid;
    const mergedValidation: AiValidationOutput = {
      isReadyToPublish: validation.isReadyToPublish
      && mergedBlockingIssues.length === 0
      && effectiveConfidence >= 60
      && metadata.usedFallback !== true
      && responseValid,
      qualityScore: this.adjustQualityScoreForIssues(
        this.deriveQualityScore(
          { review: { ...review, confidence: effectiveConfidence } },
          mergedBlockingIssues,
          mergedWarnings,
          metadata.usedFallback,
        ),
        mergedBlockingIssues,
        mergedWarnings,
      ),
      blockingIssues: mergedBlockingIssues,
      warnings: mergedWarnings,
      recommendations: mergedRecommendations,
    };
    const isStrictSuccess = responseValid
      && metadata.usedFallback !== true
      && consistency.blockingIssues.length === 0
      && mergedValidation.blockingIssues.length === 0
      && effectiveConfidence >= 60;
    const finalDestinationType: CampaignDestinationType | null = intent.destinationType
      || (this.isHttpsUrl(creative.destinationUrl) ? 'site' : constraints.expectedDestinationType);

    if (consistency.shouldRetry || effectiveConfidence < 40 || !responseValid || metadata.usedFallback === true) {
      this.logger.log(JSON.stringify({
        operation: 'campaign_ai_suggestion',
        stage: 'campaign_ai_response_finalized',
        status: 'AI_NEEDS_RETRY',
        responseValid,
        finalCreativeCta: creative.cta,
        finalCampaignObjective: campaign.objective,
        finalDestinationType,
        finalBlockingIssues: mergedValidation.blockingIssues,
      }));
      return this.buildAiFailureResponse(
        'invalid_response',
        this.promptVersion,
        metadata.model || this.model,
        consistency.shouldRetry
          ? this.buildConsistencyFailureDebug(
            consistency,
            constraints,
            {
              strategy,
              cta: rootCta,
              audience: audienceSummary,
              campaign,
              adSet,
              creative,
            },
          )
          : undefined,
        'AI_NEEDS_RETRY',
        consistency.userMessage || 'A IA gerou uma sugestão inconsistente com o briefing. Gere novamente.',
      );
    }

    this.logger.log(JSON.stringify({
      operation: 'campaign_ai_suggestion',
      stage: 'campaign_ai_response_finalized',
      status: isStrictSuccess ? 'AI_SUCCESS' : 'AI_NEEDS_REVIEW',
      responseValid,
      finalCreativeCta: creative.cta,
      finalCampaignObjective: campaign.objective,
      finalDestinationType,
      finalBlockingIssues: mergedValidation.blockingIssues,
    }));

    return {
      status: isStrictSuccess ? 'AI_SUCCESS' : 'AI_NEEDS_REVIEW',
      intent,
      strategy,
      primaryText: rootPrimaryText,
      headline: rootHeadline,
      description: rootDescription,
      cta: rootCta,
      audience: audienceSummary,
      budgetSuggestion: campaign.budget.amount,
      risks: this.normalizeStringArrayUnique([...risks, ...degradedResponseRisk], 6),
      improvements: this.normalizeStringArrayUnique([...improvements, ...mergedRecommendations], 8),
      reasoning,
      explanation,
      planner,
      campaign,
      adSet,
      creative,
      review: {
        ...review,
        confidence: effectiveConfidence,
        risks: this.normalizeStringArrayUnique([...review.risks, ...degradedResponseRisk], 6),
        recommendations: mergedRecommendations,
      },
      validation: mergedValidation,
      meta: {
        promptVersion: this.promptVersion,
        model: metadata.model || this.model,
        usedFallback: !!metadata.usedFallback,
        responseValid,
        consistencyApproved: consistency.blockingIssues.length === 0,
      },
      debug: consistency.debug,
    };
  }

  private parseCampaignSuggestionJson(
    raw: string,
    rawText = raw,
    candidateText = '',
    finishReason: string | null = null,
    maxOutputTokens: number | null = null,
  ): ParsedCampaignSuggestion {
    const sources = [
      { label: 'responseText', value: raw },
      { label: 'candidateText', value: candidateText },
      { label: 'rawText', value: rawText },
    ].filter((source, index, list) => {
      const normalized = this.asString(source.value);
      return normalized && list.findIndex((entry) => this.asString(entry.value) === normalized) === index;
    });

    let sawTruncatedSource = false;

    for (const source of sources) {
      const sanitized = this.sanitizeJson(source.value);
      if (!sanitized) {
        continue;
      }

      sawTruncatedSource = sawTruncatedSource || this.looksTruncatedJson(sanitized);
      const extracted = this.extractJsonFromAiText(source.value);
      if (extracted === null) {
        continue;
      }

      const payload = extracted;
      const validationError = this.getCampaignSuggestionValidationError(payload);
      if (this.isDevelopment) {
        const normalizedPreview = typeof payload === 'object' && payload !== null
          ? this.normalizeCampaignAiResponse(payload)
          : null;
        this.logger.log(JSON.stringify({
          operation: 'campaign_suggestion',
          stage: 'campaign_parse_debug',
          parsedFrom: source.label,
          rawText,
          candidateText,
          finishReason,
          maxOutputTokens,
          parsedResult: payload,
          normalizedResult: normalizedPreview,
          validationError: validationError || null,
        }));
      }

      if (validationError) {
        const normalized = this.normalizeCampaignAiResponse(payload);
        return {
          payload,
          error: validationError,
          truncated: false,
          rawText,
          candidateText,
          finishReason,
          maxOutputTokens,
          validationPath: `getCampaignSuggestionValidationError.${source.label}`,
          normalizedKeys: Object.keys(normalized),
        };
      }

      return {
        payload,
        truncated: false,
        rawText,
        candidateText,
        finishReason,
        maxOutputTokens,
        validationPath: `extractJsonFromAiText.${source.label}`,
        normalizedKeys: payload && typeof payload === 'object' ? Object.keys(this.normalizeCampaignAiResponse(payload)) : [],
      };
    }

    if (!sources.length) {
      return {
        payload: null,
        error: 'empty_response',
        truncated: false,
        rawText,
        candidateText,
        finishReason,
        maxOutputTokens,
        validationPath: 'extractJsonFromAiText.empty',
      };
    }

    return {
      payload: null,
      error: sawTruncatedSource || this.isMaxTokensFinishReason(finishReason) ? 'truncated_response' : 'parse_failed',
      truncated: sawTruncatedSource || this.isMaxTokensFinishReason(finishReason),
      rawText,
      candidateText,
      finishReason,
      maxOutputTokens,
      validationPath: 'extractJsonFromAiText',
    };
  }

  private buildSafeAiFailureDebug(parsed: ParsedCampaignSuggestion): CampaignAiFailureDebug | undefined {
    if (!this.isDevelopment) {
      return undefined;
    }

    const normalized = parsed.payload && typeof parsed.payload === 'object'
      ? this.normalizeCampaignAiResponse(parsed.payload)
      : {};

    return {
      hasRawText: !!this.asString(parsed.rawText || parsed.candidateText),
      rawTextPreview: this.previewAiText(parsed.rawText),
      candidateTextPreview: this.previewAiText(parsed.candidateText),
      rawTextLength: this.asString(parsed.rawText).length,
      candidateTextLength: this.asString(parsed.candidateText).length,
      finishReason: parsed.finishReason ?? null,
      maxOutputTokens: parsed.maxOutputTokens ?? null,
      candidateTextEndsWithClosingBrace: this.asString(parsed.candidateText).trim().endsWith('}'),
      parsedType: this.describeParsedType(parsed.payload),
      normalizedKeys: Object.keys(normalized),
      validationError: parsed.error || 'invalid_response',
      validationPath: parsed.validationPath || 'unknown',
    };
  }

  private previewAiText(value?: string): string {
    return this.asString(value).slice(0, 1000);
  }

  private describeParsedType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private buildTextualDraftCampaignPayload(
    rawText: string,
    prompt: string,
    storeContext?: StoreAiContext,
  ): Record<string, unknown> | null {
    const usefulText = this.extractUsefulAiText(rawText);
    if (!usefulText) {
      return null;
    }

    const segment = this.firstSpecificText(storeContext?.segment) || this.inferVertical(prompt);
    const generatedHeadline = this.normalizeStructuredText(
      this.buildFallbackCampaignName(segment, storeContext?.companyName || '', prompt),
      'Rascunho de campanha com revisão manual',
      80,
    );

    return {
      strategy: usefulText.slice(0, 220),
      primaryText: usefulText.slice(0, 260),
      headline: generatedHeadline,
      description: this.buildFallbackDifferentialText(storeContext, segment),
      cta: this.inferFallbackCta(prompt, storeContext),
      audience: storeContext?.targetAudience || storeContext?.storeProfile.targetAudienceBase || segment,
      budgetSuggestion: null,
      risks: ['A IA respondeu fora do formato ideal. Revise antes de publicar.'],
      improvements: [
        'Revise a headline antes de publicar.',
        'Confirme público, orçamento e destino final manualmente.',
      ],
      reasoning: ['A resposta da IA foi aproveitada como rascunho textual com baixa confiança.'],
      explanation: {
        strategy: 'O texto foi convertido em rascunho para evitar descarte de uma resposta potencialmente útil.',
        audience: 'O público pode exigir revisão manual antes da publicação.',
        copy: 'A copy foi extraída diretamente do texto retornado pela IA.',
        budget: 'O orçamento deve ser confirmado manualmente.',
      },
      planner: {
        goal: this.firstSpecificText(storeContext?.campaignIntent.goal, prompt),
        audienceIntent: storeContext?.targetAudience || null,
        missingInputs: ['Validar estrutura final da resposta da IA.', 'Revisar campos obrigatórios manualmente.'],
        assumptions: ['A resposta foi aproveitada fora do formato JSON esperado.'],
      },
      review: {
        summary: 'Rascunho aproveitado de resposta textual fora do JSON esperado.',
        strengths: ['Houve conteúdo textual suficiente para iniciar o rascunho.'],
        risks: ['A IA respondeu fora do formato ideal. Revise antes de publicar.'],
        recommendations: ['Complete os campos faltantes antes de enviar a campanha.'],
        confidence: 32,
      },
      validation: {
        isReadyToPublish: false,
        qualityScore: 42,
        blockingIssues: [],
        warnings: ['Resposta aproveitada em modo degradado; revisão manual obrigatória.'],
        recommendations: ['Revise texto, público, orçamento e URL antes de publicar.'],
      },
    };
  }

  private buildConsistencyFailureDebug(
    consistency: {
      blockingIssues: string[];
      warnings: string[];
      recommendations: string[];
      shouldRetry: boolean;
      userMessage?: string;
      debug?: ConsistencyDebugInfo;
    },
    constraints: BriefingConstraints,
    detected: {
      strategy: string;
      cta: string;
      audience: AiCampaignAudienceSummary;
      campaign: AiCampaignOutput;
      adSet: AiAdSetOutput;
      creative: AiCreativeOutput;
    },
  ): CampaignAiFailureDebug | undefined {
    if (!this.isDevelopment) {
      return undefined;
    }

    return {
      hasRawText: false,
      rawTextPreview: '',
      candidateTextPreview: '',
      rawTextLength: 0,
      candidateTextLength: 0,
      finishReason: null,
      maxOutputTokens: null,
      candidateTextEndsWithClosingBrace: false,
      consistencyErrors: consistency.blockingIssues,
      expectedBriefingSignals: consistency.debug?.expectedBriefingSignals || {
        expectedSegment: constraints.expectedSegment,
        expectedObjective: constraints.expectedObjective,
        expectedBudget: constraints.expectedBudget,
        expectedBudgetType: constraints.expectedBudgetType,
        expectedCta: constraints.expectedCta,
        expectedDestinationType: constraints.expectedDestinationType,
        expectsRemarketing: constraints.expectsRemarketing,
      },
      detectedResponseSignals: consistency.debug?.detectedResponseSignals || {
        objective: detected.campaign.objective,
        budget: detected.campaign.budget.amount,
        budgetType: detected.campaign.budget.type,
        cta: detected.creative.cta || detected.cta,
        destinationUrl: detected.creative.destinationUrl,
        destinationType: this.isHttpsUrl(detected.creative.destinationUrl) ? 'site' : 'messages',
        segment: this.inferVertical([
          detected.strategy,
          detected.creative.primaryText,
          detected.creative.headline,
          detected.adSet.targeting.interests.join(', '),
        ].filter(Boolean).join(' ')),
        audience: {
          gender: detected.audience.gender,
          ageRange: detected.audience.ageRange,
          interests: detected.audience.interests,
          targetingInterests: detected.adSet.targeting.interests,
          city: detected.adSet.targeting.city,
        },
      },
      failedRules: consistency.debug?.failedRules || [],
      immutableFieldsExpected: consistency.debug?.immutableFieldsExpected || {
        objective: constraints.expectedObjective,
        budgetAmount: constraints.expectedBudget,
        budgetType: constraints.expectedBudgetType,
        cta: constraints.expectedCta,
        destinationType: constraints.expectedDestinationType,
        segment: constraints.expectedSegment,
        campaignType: 'AUCTION',
        storeId: null,
      },
      immutableFieldsReceived: consistency.debug?.immutableFieldsReceived || {
        objective: detected.campaign.objective,
        budgetAmount: detected.campaign.budget.amount,
        budgetType: detected.campaign.budget.type,
        cta: detected.creative.cta || detected.cta,
        destinationType: this.isHttpsUrl(detected.creative.destinationUrl) ? 'site' : 'messages',
        segment: this.inferVertical([
          detected.strategy,
          detected.creative.primaryText,
          detected.creative.headline,
          detected.adSet.targeting.interests.join(', '),
        ].filter(Boolean).join(' ')),
        campaignType: detected.campaign.buyingType,
        storeId: null,
      },
      immutableFieldMismatches: consistency.debug?.immutableFieldMismatches || [],
      parsedType: 'object',
      normalizedKeys: [],
      validationError: 'consistency_retry',
      validationPath: 'validateSuggestionConsistency',
    };
  }

  private buildContextOnlyDraftCampaignPayload(
    prompt: string,
    storeContext: StoreAiContext | undefined,
    reason: 'timeout' | 'api_error',
  ): Record<string, unknown> {
    const segment = this.firstSpecificText(storeContext?.segment) || this.inferVertical(prompt);
    const campaignName = this.buildFallbackCampaignName(
      segment,
      storeContext?.companyName || storeContext?.storeName || '',
      prompt,
    );
    const objective = this.normalizeStructuredObjective(storeContext?.campaignIntent.goal, prompt);
    const budget = this.normalizeStructuredBudget(null, prompt);
    const targeting = this.normalizeStructuredTargeting(null, prompt);
    const primaryText = this.buildFallbackCopy(segment, storeContext);
    const description = this.buildFallbackDifferentialText(storeContext, segment);
    const cta = this.inferFallbackCta(prompt, storeContext);
    const destinationUrl = this.normalizeHttpsUrl(storeContext?.website);
    const reviewWarning = reason === 'timeout'
      ? 'A IA externa excedeu o tempo limite e a Nexora montou um rascunho local para não travar o fluxo.'
      : 'A IA externa ficou indisponível e a Nexora montou um rascunho local com base no contexto da store.';

    return {
      strategy: this.buildFallbackStrategy(segment, storeContext),
      primaryText,
      headline: campaignName,
      description,
      cta,
      audience: {
        gender: targeting.gender,
        ageRange: targeting.ageMin && targeting.ageMax ? `${targeting.ageMin}-${targeting.ageMax}` : null,
        interests: targeting.interests,
      },
      budgetSuggestion: budget.amount,
      risks: [
        reviewWarning,
        'Revise copy, público, orçamento e URL antes de publicar.',
      ],
      improvements: [
        'Confirmar a oferta principal e o diferencial que mais converte para a store.',
        'Validar URL final, criativo e público antes do envio para a Meta.',
      ],
      reasoning: [
        `O rascunho foi montado usando o contexto real da store no segmento ${segment}.`,
        storeContext?.campaignIntent.primaryOffer
          ? `A oferta principal considerada foi ${storeContext.campaignIntent.primaryOffer}.`
          : 'A oferta principal ainda precisa de revisão manual.',
        reviewWarning,
      ],
      explanation: {
        strategy: 'A Nexora usou apenas o contexto real da store e do briefing para não deixar o usuário sem ponto de partida.',
        audience: 'O público foi montado com base nos sinais disponíveis da operação e precisa de revisão humana antes da publicação.',
        copy: 'A copy foi escrita com foco em especificidade mínima segura, sem inventar dados comerciais críticos.',
        budget: 'O orçamento foi inferido de forma conservadora até a IA externa voltar a responder normalmente.',
      },
      planner: {
        businessType: storeContext?.businessType || segment,
        goal: storeContext?.campaignIntent.goal || this.inferFallbackObjective(prompt),
        funnelStage: this.normalizeStructuredFunnelStage(storeContext?.campaignIntent.funnelStage, prompt),
        offer: storeContext?.campaignIntent.primaryOffer || storeContext?.storeProfile.mainOffer || null,
        audienceIntent: storeContext?.targetAudience || null,
        missingInputs: this.buildFallbackMissingInputs(prompt, storeContext),
        assumptions: this.buildFallbackAssumptions(segment, storeContext),
      },
      campaign: {
        campaignName,
        objective,
        buyingType: 'AUCTION',
        status: 'PAUSED',
        budget,
      },
      adSet: {
        name: `${campaignName} | Publico 1`,
        optimizationGoal: this.buildFallbackOptimizationGoal(objective),
        billingEvent: this.buildFallbackBillingEvent(objective),
        targeting,
      },
      creative: {
        name: `${campaignName} | Criativo 1`,
        primaryText,
        headline: campaignName,
        description,
        cta,
        imageSuggestion: null,
        destinationUrl,
      },
      review: {
        summary: this.buildFallbackCampaignAngle(segment, prompt, storeContext),
        strengths: this.buildKnownFacts(storeContext, prompt),
        risks: [reviewWarning],
        recommendations: [
          'Revise a proposta comercial, o público e os dados operacionais antes de publicar.',
          'Quando possível, regenere a campanha com a IA externa para obter uma versão mais detalhada.',
        ],
        confidence: 34,
      },
      validation: {
        isReadyToPublish: false,
        qualityScore: 35,
        blockingIssues: [],
        warnings: [reviewWarning],
        recommendations: ['Use este rascunho apenas como ponto de partida e revise todos os campos.'],
      },
    };
  }

  private extractUsefulAiText(rawText: string): string | null {
    const normalized = this.asString(rawText)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized || normalized.length < 12) {
      return null;
    }

    if (/^(null|undefined|n\/a|nao e json|não é json)$/i.test(normalized)) {
      return null;
    }

    return normalized;
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

  private extractJsonFromAiText(raw: string): unknown {
    const sanitized = this.sanitizeJson(raw);
    if (!sanitized) {
      return null;
    }

    const directParse = this.tryParseJsonWithCommonFixes(sanitized);
    if (directParse !== null) {
      return directParse;
    }

    const unwrappedQuoted = this.unwrapQuotedJsonString(sanitized);
    if (unwrappedQuoted) {
      const parsedQuoted = this.tryParseJsonWithCommonFixes(unwrappedQuoted);
      if (parsedQuoted !== null) {
        return parsedQuoted;
      }
    }

    const balancedObject = this.findBalancedJsonObject(sanitized);
    if (balancedObject) {
      const parsedBalanced = this.tryParseJsonWithCommonFixes(balancedObject);
      if (parsedBalanced !== null) {
        return parsedBalanced;
      }
    }

    return null;
  }

  private tryParseJsonWithCommonFixes(value: string): unknown {
    const attempts = [
      value,
      value.replace(/,\s*([}\]])/g, '$1'),
    ];

    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt);
      } catch {
        continue;
      }
    }

    return null;
  }

  private unwrapQuotedJsonString(value: string): string | null {
    const trimmed = value.trim();
    if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return null;
    }

    try {
      const unwrapped = JSON.parse(trimmed);
      return typeof unwrapped === 'string' ? unwrapped.trim() : null;
    } catch {
      return null;
    }
  }

  private findBalancedJsonObject(value: string): string | null {
    const start = value.indexOf('{');
    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const char = value[index];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return value.slice(start, index + 1);
        }
      }
    }

    return null;
  }

  private looksTruncatedJson(raw: string): boolean {
    if (!raw) return false;
    if (!raw.startsWith('{')) return false;
    if (!raw.endsWith('}')) return true;

    const quotes = raw.match(/(?<!\\)"/g)?.length || 0;
    return quotes % 2 !== 0;
  }

  private isMaxTokensFinishReason(value: string | null | undefined): boolean {
    const normalized = this.asString(value).toUpperCase();
    return normalized === 'MAX_TOKENS' || normalized === 'LENGTH';
  }

  private getCampaignSuggestionValidationError(payload: unknown): string | null {
    if (payload === null || payload === undefined) {
      return 'empty_response';
    }
    if (typeof payload !== 'object' || Array.isArray(payload)) {
      return 'payload_not_object';
    }
    const normalized = this.normalizeCampaignAiResponse(payload);
    const candidate = normalized as Record<string, unknown>;
    const creative = candidate.creative as Record<string, unknown> | undefined;
    const campaign = candidate.campaign as Record<string, unknown> | undefined;
    const audience = candidate.audience as Record<string, unknown> | string | undefined;

    const primaryText = this.asString(candidate.primaryText) || this.asString(creative?.primaryText);
    const headline = this.asString(candidate.headline) || this.asString(creative?.headline);
    const strategy = this.asString(candidate.strategy);
    const objective = this.asString(campaign?.objective);
    const hasAudience = this.hasUsefulAudience(audience)
      || this.hasUsefulAudience((candidate.adSet as Record<string, unknown> | undefined)?.targeting);

    if (!Object.keys(candidate).length) return 'normalized_empty';
    if (objective && !this.isObjective(objective)) return 'invalid_objective';
    if (this.containsRawJsonArtifact(primaryText) || this.containsRawJsonArtifact(headline) || this.containsRawJsonArtifact(strategy)) {
      return 'raw_json_in_copy';
    }
    if (!primaryText && !headline && !strategy) {
      return 'missing_primaryText_headline_strategy';
    }
    if (!primaryText) return 'missing_primaryText';
    if (!headline) return 'missing_headline';
    if (!hasAudience) return 'missing_audience';
    if (!this.asString(candidate.cta) && !this.asString(creative?.cta)) return 'missing_cta';

    return null;
  }

  private getCampaignAnalysisValidationError(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return 'payload_not_object';
    }

    const candidate = payload as Record<string, unknown>;
    const businessDiagnosis = this.firstObject(candidate.businessDiagnosis);
    const performanceAnalysis = this.firstObject(candidate.performanceAnalysis);
    const executiveDecision = this.firstObject(candidate.executiveDecision);

    if (typeof candidate.overallScore !== 'number') return 'missing_or_invalid_overallScore';
    if (!this.isCampaignRiskLevel(candidate.riskLevel)) return 'missing_or_invalid_riskLevel';
    if (typeof candidate.isReadyToPublish !== 'boolean') return 'missing_or_invalid_isReadyToPublish';
    if (!businessDiagnosis) return 'missing_or_invalid_businessDiagnosis';
    if (!this.asString(businessDiagnosis.summary)) return 'missing_business_summary';
    if (!this.asString(businessDiagnosis.mainProblem)) return 'missing_business_mainProblem';
    if (!this.asString(businessDiagnosis.mainOpportunity)) return 'missing_business_mainOpportunity';
    if (!Array.isArray(candidate.blockingIssues)) return 'missing_or_invalid_blockingIssues';
    if (!Array.isArray(candidate.warnings)) return 'missing_or_invalid_warnings';
    if (!Array.isArray(candidate.recommendations)) return 'missing_or_invalid_recommendations';
    if (!performanceAnalysis) return 'missing_or_invalid_performanceAnalysis';
    if (!this.asString(performanceAnalysis.conversionPotential)) return 'missing_conversionPotential';
    if (!this.asString(performanceAnalysis.financialRisk)) return 'missing_financialRisk';
    if (!this.asString(performanceAnalysis.metaApprovalRisk)) return 'missing_metaApprovalRisk';
    if (!this.asString(performanceAnalysis.scalabilityPotential)) return 'missing_scalabilityPotential';
    if (!executiveDecision) return 'missing_or_invalid_executiveDecision';
    if (!this.isCampaignExecutiveDecision(executiveDecision.decision)) return 'missing_or_invalid_decision';
    if (!this.asString(executiveDecision.reason)) return 'missing_decision_reason';

    return null;
  }

  private buildCampaignSuggestionCompletenessImprovements(
    normalizedPayload: Record<string, unknown>,
  ): string[] {
    const improvements: string[] = [];
    const creative = this.firstObject(normalizedPayload.creative);
    const campaign = this.firstObject(normalizedPayload.campaign);
    const audience = normalizedPayload.audience as Record<string, unknown> | string | undefined;

    if (!this.asString(normalizedPayload.primaryText) && !this.asString(creative?.primaryText)) {
      improvements.push('Adicione ou revise o texto principal da campanha.');
    }
    if (!this.asString(normalizedPayload.headline) && !this.asString(creative?.headline)) {
      improvements.push('Adicione ou revise a headline da campanha.');
    }
    if (!this.asString(normalizedPayload.strategy) && !this.asString(campaign?.objective)) {
      improvements.push('Defina a estratégia ou objetivo principal da campanha.');
    }
    if (!this.hasUsefulAudience(audience)
      && !this.hasUsefulAudience((normalizedPayload.adSet as Record<string, unknown> | undefined)?.targeting)) {
      improvements.push('Revise o público-alvo antes de publicar.');
    }
    if (!this.normalizeHttpsUrl(creative?.destinationUrl)) {
      improvements.push('Inclua uma URL final em https se a campanha depender de destino externo.');
    }

    return improvements;
  }

  private normalizeCampaignAnalysisResponse(
    payload: unknown,
    input: CampaignCopilotAnalysisRequest,
    metadata: { model?: string; usedFallback?: boolean; responseValid?: boolean } = {},
  ): CampaignAnalysisResponse {
    const derived = this.buildStrategicDerivedCampaignAnalysis(input);
    const candidate = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
    const analysisPayload = this.firstObject(candidate.analysis) ?? candidate;
    const overallScore = this.normalizeConfidenceScore(analysisPayload.overallScore) ?? derived.overallScore;
    const blockingIssues = this.normalizeStringArrayUnique(
      [
        ...(Array.isArray(analysisPayload.blockingIssues) ? analysisPayload.blockingIssues : []),
        ...derived.blockingIssues,
      ],
      6,
    );
    const warnings = this.normalizeStringArrayUnique(
      [
        ...(Array.isArray(analysisPayload.warnings) ? analysisPayload.warnings : []),
        ...derived.warnings,
      ],
      6,
    );
    const recommendations = this.normalizeStringArrayUnique(
      [
        ...(Array.isArray(analysisPayload.recommendations) ? analysisPayload.recommendations : []),
        ...derived.recommendations,
      ],
      6,
    );
    const derivedRiskLevel = this.deriveCampaignRiskLevel(overallScore, blockingIssues);
    const candidateRiskLevel = this.normalizeCampaignRiskLevel(analysisPayload.riskLevel);
    const riskLevel = candidateRiskLevel
      ? this.moreSevereRiskLevel(candidateRiskLevel, derivedRiskLevel)
      : derivedRiskLevel;
    const derivedIsReadyToPublish = derived.isReadyToPublish && blockingIssues.length === 0 && riskLevel !== 'CRITICAL';
    const candidateIsReadyToPublish = this.normalizeBooleanValue(analysisPayload.isReadyToPublish);
    const isReadyToPublish = derivedIsReadyToPublish
      && candidateIsReadyToPublish !== false
      && blockingIssues.length === 0;
    const derivedExecutiveDecision: AiCampaignExecutiveDecision = {
      decision: this.deriveCampaignExecutiveDecision(
        isReadyToPublish,
        riskLevel,
        blockingIssues,
        warnings,
      ),
      reason: derived.executiveDecision.reason,
    };
    const candidateExecutiveDecision = this.normalizeCampaignExecutiveDecision(
      analysisPayload.executiveDecision,
      derivedExecutiveDecision,
    );
    const executiveDecision: AiCampaignExecutiveDecision = {
      decision: this.moreRestrictiveExecutiveDecision(candidateExecutiveDecision.decision, derivedExecutiveDecision.decision),
      reason: this.normalizeStructuredText(
        candidateExecutiveDecision.reason,
        derivedExecutiveDecision.reason,
        220,
      ),
    };
    const analysis: AiCampaignCopilotAnalysis = {
      overallScore,
      riskLevel,
      isReadyToPublish,
      businessDiagnosis: this.normalizeCampaignBusinessDiagnosis(analysisPayload.businessDiagnosis, derived.businessDiagnosis),
      blockingIssues,
      warnings,
      recommendations,
      performanceAnalysis: this.normalizeCampaignPerformanceAnalysis(
        analysisPayload.performanceAnalysis,
        derived.performanceAnalysis,
      ),
      executiveDecision,
      summary: this.normalizeStructuredText(
        this.asString(analysisPayload.summary) || this.firstObject(analysisPayload.businessDiagnosis)?.summary,
        derived.summary || derived.businessDiagnosis.summary,
        220,
      ),
      strengths: this.normalizeStringArrayUnique(
        Array.isArray(analysisPayload.strengths) ? analysisPayload.strengths : (derived.strengths || []),
        4,
      ),
      issues: this.normalizeStringArrayUnique(
        [
          ...(Array.isArray(analysisPayload.issues) ? analysisPayload.issues : []),
          ...blockingIssues,
        ],
        6,
      ),
      improvements: this.normalizeCampaignAnalysisImprovements(
        Array.isArray(analysisPayload.improvements) ? analysisPayload.improvements : (derived.improvements || []),
        5,
        derived.improvements || [],
      ),
      confidence: this.normalizeConfidenceScore(analysisPayload.confidence) ?? derived.confidence ?? derived.overallScore,
    };

    return {
      status: 'AI_SUCCESS',
      analysis,
      meta: {
        promptVersion: this.analysisPromptVersion,
        model: metadata.model || this.model,
        usedFallback: !!metadata.usedFallback,
        responseValid: metadata.responseValid !== false,
      },
    };
  }

  private normalizeCampaignAiResponse(parsed: unknown): Record<string, unknown> {
    const candidate = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    const creativeSource = this.firstObject(candidate.creative, candidate.ad, candidate.copy);
    const campaignSource = this.firstObject(candidate.campaign);
    const adSetSource = this.firstObject(candidate.adSet, candidate.adset, candidate.targeting);
    const plannerSource = this.firstObject(candidate.planner);
    const reviewSource = this.firstObject(candidate.review);
    const validationSource = this.firstObject(candidate.validation);

    const primaryText = this.firstSpecificText(
      candidate.primaryText,
      creativeSource?.primaryText,
      creativeSource?.message,
      creativeSource?.mainText,
      creativeSource?.adText,
      candidate.message,
      candidate.mainText,
      candidate.adText,
    );
    const headline = this.firstSpecificText(
      candidate.headline,
      creativeSource?.headline,
      creativeSource?.adHeadline,
      candidate.adHeadline,
      campaignSource?.title,
      campaignSource?.name,
    );
    const description = this.firstSpecificText(
      candidate.description,
      creativeSource?.description,
      creativeSource?.desc,
      candidate.desc,
    );
    const cta = this.firstSpecificText(
      candidate.cta,
      creativeSource?.cta,
      candidate.callToAction,
      creativeSource?.callToAction,
    );
    const destinationUrl = this.firstSpecificText(
      creativeSource?.destinationUrl,
      candidate.destinationUrl,
      creativeSource?.url,
      candidate.url,
      creativeSource?.landingPage,
      candidate.landingPage,
    );
    const campaignName = this.firstSpecificText(
      campaignSource?.campaignName,
      campaignSource?.name,
      campaignSource?.title,
      candidate.campaignName,
      candidate.name,
      candidate.title,
    );
    const budgetValue = campaignSource?.budget ?? candidate.budgetSuggestion ?? candidate.budget ?? candidate.dailyBudget;
    const audienceValue = candidate.audience ?? adSetSource?.targeting ?? candidate.targeting;

    return {
      ...candidate,
      strategy: this.firstSpecificText(candidate.strategy, reviewSource?.summary, plannerSource?.goal),
      primaryText,
      headline,
      description,
      cta,
      audience: this.normalizeAudienceSource(audienceValue),
      budgetSuggestion: budgetValue,
      risks: this.normalizeArrayOrDelimitedString(candidate.risks),
      improvements: this.normalizeArrayOrDelimitedString(candidate.improvements),
      reasoning: this.normalizeArrayOrDelimitedString(candidate.reasoning),
      explanation: this.firstObject(candidate.explanation),
      planner: {
        ...plannerSource,
        goal: this.firstSpecificText(plannerSource?.goal, candidate.strategy),
      },
      campaign: {
        ...campaignSource,
        campaignName,
        objective: this.firstSpecificText(campaignSource?.objective, candidate.objective),
        budget: this.normalizeBudgetSource(budgetValue, campaignSource?.budgetType),
      },
      adSet: {
        ...adSetSource,
        targeting: this.normalizeTargetingSource(adSetSource?.targeting ?? candidate.targeting ?? audienceValue),
      },
      creative: {
        ...creativeSource,
        primaryText,
        headline,
        description,
        cta,
        destinationUrl,
        imageSuggestion: this.firstSpecificText(creativeSource?.imageSuggestion, candidate.imageSuggestion),
      },
      review: {
        ...reviewSource,
        summary: this.firstSpecificText(reviewSource?.summary, candidate.strategy, primaryText),
        strengths: this.normalizeArrayOrDelimitedString(reviewSource?.strengths),
        risks: this.normalizeArrayOrDelimitedString(reviewSource?.risks ?? candidate.risks),
        recommendations: this.normalizeArrayOrDelimitedString(reviewSource?.recommendations ?? candidate.improvements),
        confidence: this.normalizePositiveNumber(reviewSource?.confidence),
      },
      validation: validationSource,
    };
  }

  private buildAiFailureResponse(
    reason: CampaignAiFailureReason,
    promptVersion: string,
    model: string,
    debug?: CampaignAiFailureDebug,
    status: 'AI_FAILED' | 'AI_NEEDS_RETRY' = 'AI_FAILED',
    messageOverride?: string,
  ): CampaignAiFailureResponse {
    return {
      status,
      reason,
      message: messageOverride || this.failureReasonMessage(reason),
      meta: {
        promptVersion,
        model,
        usedFallback: false,
        responseValid: false,
        consistencyApproved: false,
      },
      debug: this.isDevelopment ? debug : undefined,
    };
  }

  private classifyAiFailureReason(
    invalidResponseReason?: string,
    error?: unknown,
  ): CampaignAiFailureReason {
    if (invalidResponseReason) {
      return 'invalid_response';
    }

    const details = String(this.getErrorDetails(error)).toLowerCase();
    if (details.includes('timeout') || details.includes('timed out') || details.includes('deadline exceeded')) {
      return 'timeout';
    }

    return 'api_error';
  }

  private failureReasonMessage(reason: CampaignAiFailureReason): string {
    switch (reason) {
      case 'timeout':
        return 'Não conseguimos gerar a campanha com IA agora.';
      case 'invalid_response':
        return 'A IA respondeu em um formato inválido no momento.';
      case 'missing_api_key':
        return 'A integração de IA não está disponível no momento.';
      case 'api_error':
      default:
        return 'Não conseguimos gerar a campanha com IA agora.';
    }
  }

  private logCampaignIntentResolution(
    requestId: string | undefined,
    storeId: string,
    prompt: string,
    storeContext: StoreAiContext,
    campaignIntent: DeterministicCampaignIntent,
  ): void {
    const briefing = this.extractPromptBriefing(prompt);
    const payload = {
      module: CampaignAiService.name,
      requestId,
      storeId,
      briefingExtracted: briefing,
      campaignIntentFinal: campaignIntent,
      fieldOrigins: {
        objective: briefing.objective || briefing.destinationType === 'messages'
          ? 'prompt'
          : storeContext.fieldOrigins.goal || 'backend_inference',
        destinationType: briefing.destinationType
          ? 'prompt'
          : storeContext.fieldOrigins.destinationType || 'backend_inference',
        budgetAmount: briefing.budget
          ? 'prompt'
          : storeContext.fieldOrigins.budget || 'backend_inference',
        budgetType: briefing.budgetType
          ? 'prompt'
          : campaignIntent.budgetType
          ? 'backend_inference'
          : null,
        segment: briefing.segment
          ? 'prompt'
          : storeContext.fieldOrigins.segment,
        region: briefing.region
          ? 'prompt'
          : storeContext.fieldOrigins.region,
        funnelStage: briefing.funnelStage
          ? 'prompt'
          : storeContext.fieldOrigins.funnelStage || 'backend_inference',
        channel: briefing.channelPreference
          ? 'prompt'
          : storeContext.fieldOrigins.channelPreference || 'backend_inference',
        offer: briefing.primaryOffer
          ? 'prompt'
          : storeContext.fieldOrigins.primaryOffer,
      },
    };

    if (this.structuredLogger) {
      this.structuredLogger.info('Campaign AI resolved briefing and intent before Gemini', payload);
      return;
    }

    this.logger.log(JSON.stringify({
      event: 'campaign_ai_intent_resolved',
      ...payload,
    }));
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

  private normalizeBooleanValue(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
  }

  private isCampaignRiskLevel(value: unknown): value is AiCampaignRiskLevel {
    return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL';
  }

  private normalizeCampaignRiskLevel(value: unknown): AiCampaignRiskLevel | null {
    return this.isCampaignRiskLevel(value) ? value : null;
  }

  private isCampaignExecutiveDecision(value: unknown): value is AiCampaignExecutiveDecisionValue {
    return value === 'PUBLISH' || value === 'BLOCK' || value === 'REVIEW' || value === 'RESTRUCTURE';
  }

  private normalizeCampaignBusinessDiagnosis(
    value: unknown,
    fallback: AiCampaignBusinessDiagnosis,
  ): AiCampaignBusinessDiagnosis {
    const candidate = this.firstObject(value);
    return {
      summary: this.normalizeStructuredText(candidate?.summary, fallback.summary, 220),
      mainProblem: this.normalizeStructuredText(candidate?.mainProblem, fallback.mainProblem, 220),
      mainOpportunity: this.normalizeStructuredText(candidate?.mainOpportunity, fallback.mainOpportunity, 220),
    };
  }

  private normalizeCampaignPerformanceAnalysis(
    value: unknown,
    fallback: AiCampaignPerformanceAnalysis,
  ): AiCampaignPerformanceAnalysis {
    const candidate = this.firstObject(value);
    return {
      conversionPotential: this.normalizeStructuredText(candidate?.conversionPotential, fallback.conversionPotential, 220),
      financialRisk: this.normalizeStructuredText(candidate?.financialRisk, fallback.financialRisk, 220),
      metaApprovalRisk: this.normalizeStructuredText(candidate?.metaApprovalRisk, fallback.metaApprovalRisk, 220),
      scalabilityPotential: this.normalizeStructuredText(candidate?.scalabilityPotential, fallback.scalabilityPotential, 220),
    };
  }

  private normalizeCampaignExecutiveDecision(
    value: unknown,
    fallback: AiCampaignExecutiveDecision,
  ): AiCampaignExecutiveDecision {
    const candidate = this.firstObject(value);
    return {
      decision: this.isCampaignExecutiveDecision(candidate?.decision) ? candidate.decision : fallback.decision,
      reason: this.normalizeStructuredText(candidate?.reason, fallback.reason, 220),
    };
  }

  private deriveCampaignRiskLevel(score: number, blockingIssues: string[]): AiCampaignRiskLevel {
    if (blockingIssues.length >= 2 || score <= 25) return 'CRITICAL';
    if (blockingIssues.length >= 1 || score <= 49) return 'HIGH';
    if (score <= 74) return 'MEDIUM';
    return 'LOW';
  }

  private moreSevereRiskLevel(
    left: AiCampaignRiskLevel,
    right: AiCampaignRiskLevel,
  ): AiCampaignRiskLevel {
    const severity: Record<AiCampaignRiskLevel, number> = {
      LOW: 0,
      MEDIUM: 1,
      HIGH: 2,
      CRITICAL: 3,
    };

    return severity[left] >= severity[right] ? left : right;
  }

  private deriveCampaignExecutiveDecision(
    isReadyToPublish: boolean,
    riskLevel: AiCampaignRiskLevel,
    blockingIssues: string[],
    warnings: string[],
  ): AiCampaignExecutiveDecisionValue {
    if (isReadyToPublish && riskLevel === 'LOW') return 'PUBLISH';
    if (blockingIssues.length >= 2 || riskLevel === 'CRITICAL') return 'BLOCK';
    if (blockingIssues.length === 1 || riskLevel === 'HIGH') return 'REVIEW';
    if (warnings.length >= 3) return 'RESTRUCTURE';
    return 'REVIEW';
  }

  private moreRestrictiveExecutiveDecision(
    left: AiCampaignExecutiveDecisionValue,
    right: AiCampaignExecutiveDecisionValue,
  ): AiCampaignExecutiveDecisionValue {
    const severity: Record<AiCampaignExecutiveDecisionValue, number> = {
      PUBLISH: 0,
      REVIEW: 1,
      RESTRUCTURE: 2,
      BLOCK: 3,
    };

    return severity[left] >= severity[right] ? left : right;
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
  ): any {
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

  private buildStrategicDerivedCampaignAnalysis(
    input: CampaignCopilotAnalysisRequest,
  ): AiCampaignCopilotAnalysis {
    const objective = this.asString(input.objective || (input.campaign as Record<string, unknown>)?.objective);
    const campaign = (input.campaign || {}) as Record<string, unknown>;
    const creative = (input.creative || {}) as Record<string, unknown>;
    const targeting = (input.targeting || {}) as Record<string, unknown>;
    const budget = (input.budget || {}) as Record<string, unknown>;
    const location = (input.location || {}) as Record<string, unknown>;
    const message = this.asString(creative.message || creative.primaryText);
    const headline = this.asString(creative.headline);
    const description = this.asString(creative.description);
    const cta = this.asString(input.cta || creative.cta).toUpperCase();
    const destinationUrl = this.asString(input.destinationUrl || creative.destinationUrl);
    const destinationType = this.asString(campaign.destinationType || creative.destinationType || targeting.destinationType).toLowerCase();
    const interests = this.normalizeStringArray((targeting as Record<string, unknown>).interests);
    const city = this.asString(location.city || targeting.city);
    const stateCode = this.asString(location.state || targeting.stateCode || targeting.state);
    const country = this.asString(location.country || targeting.country).toUpperCase();
    const autoAudience = targeting.autoAudience === true;
    const ageMin = this.normalizePositiveNumber(targeting.ageMin);
    const ageMax = this.normalizePositiveNumber(targeting.ageMax);
    const budgetValue = this.normalizePositiveNumber(budget.value || budget.amount);
    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const destinationSignals = `${destinationUrl} ${destinationType} ${message} ${headline}`.toLowerCase();
    const isMessagesCampaign = destinationType === 'messages' || /(whatsapp|messenger|instagram dm|direct|messages?)/i.test(destinationSignals);

    if (budgetValue === null || budgetValue <= 0) {
      blockingIssues.push('Orçamento ausente, zerado ou inválido.');
    }

    if (!objective) {
      blockingIssues.push('Objetivo da campanha ausente.');
    }

    if (!message) {
      blockingIssues.push('Copy principal ausente.');
    } else if (this.isGenericValidationCopy(message)) {
      warnings.push('A copy principal está genérica e reduz a força da oferta.');
      recommendations.push('Deixe benefício, oferta e próximo passo explícitos na primeira leitura.');
    }

    if (!headline || headline.length < 8) {
      blockingIssues.push('Headline ausente ou fraca para comunicar o benefício.');
    }

    if (!cta) {
      blockingIssues.push('CTA ausente.');
    } else if (this.isWeakValidationCta(cta, this.normalizeStructuredObjective(objective, objective))) {
      warnings.push('O CTA atual parece pouco acionável para o objetivo escolhido.');
      recommendations.push('Use um CTA mais próximo da conversão esperada.');
    }

    if (isMessagesCampaign) {
      blockingIssues.push('Campanhas de mensagens não estão prontas para publish automático no escopo atual.');
      recommendations.push('Mantenha revisão manual ou troque o destino para website com URL HTTPS válida.');
    } else if (!destinationUrl || !this.isHttpsUrl(destinationUrl)) {
      blockingIssues.push('Destination URL ausente ou sem HTTPS para campanha de website.');
    }

    if ((autoAudience || !interests.length) && (budgetValue || 0) <= 100) {
      warnings.push('O público está amplo demais para o orçamento atual.');
      recommendations.push('Reduza a dispersão inicial com cidade, faixa etária ou interesses mais próximos da intenção de compra.');
    }

    if ((ageMin === 18 && ageMax === 65) || ((ageMax || 0) - (ageMin || 0) >= 35)) {
      warnings.push('A faixa etária está aberta demais para uma campanha inicial.');
      recommendations.push('Aperte a faixa etária para concentrar a entrega no perfil com maior chance de resposta.');
    }

    if (country === 'BR' && city && !stateCode) {
      warnings.push('A localização está incompleta porque a cidade não tem UF definida.');
      recommendations.push('Preencha a UF junto com a cidade para evitar inconsistência operacional.');
    } else if (!city && !interests.length && (objective === 'OUTCOME_LEADS' || objective === 'OUTCOME_TRAFFIC')) {
      warnings.push('A segmentação geográfica está aberta demais para uma campanha inicial.');
      recommendations.push('Defina uma cidade principal ou um recorte geográfico mais objetivo.');
    }

    if (!description && !/(garantia|especialista|entrega|benef[ií]cio|diferencial|resultado|agende|frete)/i.test(message)) {
      warnings.push('O diferencial da oferta ainda não está claro na peça.');
      recommendations.push('Adicione prova de valor, diferencial operacional ou motivo concreto para agir agora.');
    }

    if (objective === 'OUTCOME_LEADS' && budgetValue !== null && budgetValue < 50) {
      warnings.push('O orçamento parece curto para aprendizagem de campanha de leads.');
      recommendations.push('Aumente levemente a verba inicial ou reduza o escopo do público.');
    }

    const normalizedBlockingIssues = this.normalizeStringArrayUnique(blockingIssues, 6);
    const normalizedWarnings = this.normalizeStringArrayUnique(warnings, 6);
    const normalizedRecommendations = this.normalizeStringArrayUnique(recommendations, 6);
    const overallScore = this.adjustQualityScoreForIssues(
      Math.max(18, Math.min(92, 82 - (normalizedBlockingIssues.length * 18) - (normalizedWarnings.length * 7))),
      normalizedBlockingIssues,
      normalizedWarnings,
    );
    const riskLevel = this.deriveCampaignRiskLevel(overallScore, normalizedBlockingIssues);
    const isReadyToPublish = normalizedBlockingIssues.length === 0 && !isMessagesCampaign;
    const executiveDecision = this.deriveCampaignExecutiveDecision(
      isReadyToPublish,
      riskLevel,
      normalizedBlockingIssues,
      normalizedWarnings,
    );

    return {
      overallScore,
      riskLevel,
      isReadyToPublish,
      businessDiagnosis: {
        summary: normalizedBlockingIssues.length
          ? 'A campanha apresenta risco operacional e comercial acima do aceitável para publicação automática.'
          : 'A campanha tem base utilizável, mas ainda depende de validação fina de oferta, público e execução.',
        mainProblem: normalizedBlockingIssues[0]
          || normalizedWarnings[0]
          || 'Informação insuficiente para validação segura.',
        mainOpportunity: city
          ? `Explorar uma proposta mais específica para ${city} com oferta e CTA mais diretos.`
          : 'Ganhar eficiência tornando oferta, público e próximo passo mais específicos.',
      },
      blockingIssues: normalizedBlockingIssues,
      warnings: normalizedWarnings,
      recommendations: normalizedRecommendations,
      performanceAnalysis: {
        conversionPotential: isMessagesCampaign
          ? 'A campanha pode gerar interesse, mas o destino de mensagens impede publish automático no fluxo atual.'
          : normalizedBlockingIssues.length
            ? 'O potencial de conversão está comprometido por falhas estruturais que precisam ser corrigidas antes do envio.'
            : 'Há potencial moderado de conversão se a oferta e a segmentação forem refinadas antes da publicação.',
        financialRisk: normalizedBlockingIssues.length
          ? 'Risco alto de desperdício financeiro se a campanha subir sem correção das travas atuais.'
          : normalizedWarnings.length
            ? 'Risco financeiro moderado: a campanha pode gastar com aprendizado ineficiente se mantiver público amplo ou copy genérica.'
            : 'Risco financeiro relativamente controlado para um teste inicial.',
        metaApprovalRisk: isMessagesCampaign
          ? 'Baixo a moderado em política, mas alto em risco operacional porque o fluxo automático atual não suporta mensagens end-to-end.'
          : 'Sem sinais graves de reprovação por política com os dados atuais, mas a copy ainda deve permanecer conservadora.',
        scalabilityPotential: normalizedBlockingIssues.length
          ? 'Baixo enquanto persistirem falhas de base em oferta, destino, CTA ou segmentação.'
          : normalizedWarnings.length >= 3
            ? 'Moderado, desde que a campanha prove aderência antes de ampliar verba.'
            : 'Moderado a bom para iteração futura, desde que o tracking e a landing sustentem o aprendizado.',
      },
      executiveDecision: {
        decision: executiveDecision,
        reason: executiveDecision === 'PUBLISH'
          ? 'A campanha não apresenta travas objetivas de publicação e o risco está em nível administrável.'
          : normalizedBlockingIssues[0]
            || normalizedWarnings[0]
            || 'A campanha ainda precisa de revisão antes da publicação.',
      },
      summary: normalizedBlockingIssues.length
        ? 'A campanha ainda não deve ser publicada no estado atual.'
        : 'A campanha tem base válida, mas ainda merece revisão executiva antes da escala.',
      strengths: this.normalizeStringArrayUnique([
        objective ? `Objetivo definido para ${this.mapObjectiveLabel(objective)}.` : '',
        !isMessagesCampaign && destinationUrl && this.isHttpsUrl(destinationUrl) ? 'Destino final em HTTPS preenchido.' : '',
        city || stateCode || interests.length ? 'Há sinais concretos de segmentação inicial.' : '',
      ], 4),
      issues: normalizedBlockingIssues,
      improvements: [],
      confidence: overallScore,
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
      strategy?: string;
    },
    storeContext?: StoreAiContext,
    metadata: { usedFallback?: boolean } = {},
  ): AiValidationOutput {
    const candidate = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    const derivedBlockingIssues = this.buildDerivedBlockingIssuesV2(response, storeContext);
    const derivedWarnings = this.buildDerivedValidationWarnings(response, storeContext, metadata.usedFallback);
    const derivedRecommendations = this.buildDerivedValidationRecommendations(response, storeContext);
    const hasBlockingIssues = Object.prototype.hasOwnProperty.call(candidate, 'blockingIssues');
    const hasWarnings = Object.prototype.hasOwnProperty.call(candidate, 'warnings');
    const hasRecommendations = Object.prototype.hasOwnProperty.call(candidate, 'recommendations');

    const blockingIssues = this.normalizeStringArrayUnique(
      [
        ...(hasBlockingIssues && Array.isArray(candidate.blockingIssues) ? candidate.blockingIssues : []),
        ...derivedBlockingIssues,
      ].length
        ? [
            ...(hasBlockingIssues && Array.isArray(candidate.blockingIssues) ? candidate.blockingIssues : []),
            ...derivedBlockingIssues,
          ]
        : ['Não foi possível validar a campanha automaticamente.'],
      6,
    );
    const warnings = this.normalizeStringArrayUnique(
      [
        ...(hasWarnings && Array.isArray(candidate.warnings) ? candidate.warnings : []),
        ...derivedWarnings,
      ],
      6,
    );
    const recommendations = this.normalizeStringArrayUnique(
      [
        ...(hasRecommendations && Array.isArray(candidate.recommendations) ? candidate.recommendations : []),
        ...derivedRecommendations,
      ].length
        ? [
            ...(hasRecommendations && Array.isArray(candidate.recommendations) ? candidate.recommendations : []),
            ...derivedRecommendations,
          ]
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
      strategy?: string;
    },
    storeContext?: StoreAiContext,
  ): string[] {
    const messageIntent = this.hasExplicitMessageIntent(
      [
        response.strategy,
        response.planner.goal,
        response.creative.primaryText,
        response.creative.headline,
        storeContext?.campaignIntent.destinationType,
        storeContext?.campaignIntent.channelPreference,
      ].filter(Boolean).join(' '),
      storeContext,
    );
    const issues = [
      storeContext?.dataAvailability.hasConnectedPage ? '' : 'A página da Meta não está conectada para esta store.',
      response.campaign.objective ? '' : 'A campanha precisa de um objetivo válido antes da publicação.',
      (response.campaign.budget.amount || 0) > 0 ? '' : 'A campanha precisa de orçamento maior que zero antes da publicação.',
      response.creative.headline ? '' : 'A campanha precisa de headline antes da publicação.',
      response.creative.primaryText ? '' : 'A campanha precisa de primaryText antes da publicação.',
      messageIntent || this.isHttpsUrl(response.creative.destinationUrl) ? '' : 'A campanha precisa de uma destinationUrl válida em https.',
      response.adSet.targeting.country ? '' : 'O país do público precisa ser definido.',
      response.adSet.targeting.country !== 'BR' || !response.adSet.targeting.city || response.adSet.targeting.stateCode
        ? ''
        : 'A cidade brasileira precisa estar acompanhada de uma UF válida.',
    ];

    if (!response.planner.audienceIntent && !response.adSet.targeting.interests.length && !response.adSet.targeting.city) {
      issues.push('A campanha precisa de um público utilizável antes da publicação.');
    }

    if (response.campaign.objective === 'OUTCOME_LEADS' && !response.creative.cta) {
      issues.push('A campanha de leads precisa de CTA coerente com o próximo passo.');
    }

    if (messageIntent && response.campaign.objective !== 'OUTCOME_LEADS') {
      issues.push('Briefings de WhatsApp/mensagens precisam manter objetivo coerente com mensagens antes da publicação.');
    }

    if (messageIntent && response.creative.cta !== 'MESSAGE_PAGE') {
      issues.push('Briefings de WhatsApp/mensagens precisam usar CTA compatível com conversa.');
    }

    if (messageIntent && !this.hasConfiguredMessageDestination(storeContext)) {
      issues.push('Campanhas de WhatsApp/mensagens precisam de destino de mensagem configurado: página conectada, WhatsApp ou Instagram.');
    }

    return issues.filter(Boolean);
  }

  private hasConfiguredMessageDestination(storeContext?: StoreAiContext): boolean {
    return !!(
      storeContext?.dataAvailability.hasConnectedPage
      || this.asString(storeContext?.whatsapp)
      || this.asString(storeContext?.instagram)
    );
  }

  private buildDerivedBlockingIssuesV2(
    response: {
      planner: AiPlannerOutput;
      campaign: AiCampaignOutput;
      adSet: AiAdSetOutput;
      creative: AiCreativeOutput;
      strategy?: string;
    },
    storeContext?: StoreAiContext,
  ): string[] {
    const intent = this.buildCampaignIntent(
      [
        response.strategy,
        response.planner.goal,
        response.creative.primaryText,
        response.creative.headline,
        storeContext?.campaignIntent.destinationType,
        storeContext?.campaignIntent.channelPreference,
      ].filter(Boolean).join(' '),
      storeContext,
    );
    const issues = [
      intent.metaConnected ? '' : 'Conecte a conta Meta da store antes de publicar a campanha.',
      intent.pageConnected || intent.destinationType === 'messages' ? '' : 'Conecte uma Página do Facebook antes de publicar a campanha.',
      response.campaign.objective ? '' : 'A campanha precisa de um objetivo válido antes da publicação.',
      (response.campaign.budget.amount || 0) > 0 ? '' : 'A campanha precisa de orçamento maior que zero antes da publicação.',
      response.creative.headline ? '' : 'A campanha precisa de headline antes da publicação.',
      response.creative.primaryText ? '' : 'A campanha precisa de primaryText antes da publicação.',
      intent.destinationType === 'messages' || this.isHttpsUrl(response.creative.destinationUrl)
        ? ''
        : 'Defina uma destinationUrl em HTTPS antes de publicar a campanha de site.',
      response.adSet.targeting.country ? '' : 'O país do público precisa ser definido.',
      response.adSet.targeting.country !== 'BR' || !response.adSet.targeting.city || response.adSet.targeting.stateCode
        ? ''
        : 'A cidade brasileira precisa estar acompanhada de uma UF válida.',
    ];

    if (!response.planner.audienceIntent && !response.adSet.targeting.interests.length && !response.adSet.targeting.city) {
      issues.push('A campanha precisa de um público utilizável antes da publicação.');
    }

    if (response.campaign.objective === 'OUTCOME_LEADS' && !response.creative.cta) {
      issues.push('A campanha de leads precisa de CTA coerente com o próximo passo.');
    }

    if (intent.destinationType === 'messages' && response.campaign.objective !== 'OUTCOME_LEADS') {
      issues.push('Briefings de WhatsApp/mensagens precisam manter objetivo coerente com mensagens antes da publicação.');
    }

    if (intent.destinationType === 'messages' && response.creative.cta !== 'MESSAGE_PAGE') {
      issues.push('Briefings de WhatsApp/mensagens precisam usar CTA compatível com conversa.');
    }

    if (intent.destinationType === 'messages') {
      issues.push('Campanhas de mensagens (WhatsApp, Messenger, Instagram) ainda não possuem publicação automática nesta versão. A IA pode sugerir estratégia e estrutura, mas a publicação automática atual é apenas para campanhas de website.');
    }

    if (intent.destinationType === 'messages' && !intent.messageDestinationAvailable) {
      issues.push('Conecte uma Página, Instagram ou WhatsApp Business antes de publicar campanha de mensagens.');
    }

    if (intent.destinationType === 'site' && !intent.websiteAvailable) {
      issues.push('Defina o website da store ou uma URL HTTPS válida antes de publicar campanha de site.');
    }

    if (intent.remarketingExpected && !this.hasRemarketingInfrastructure(storeContext)) {
      issues.push('Estrutura de remarketing não encontrada. Conecte pixel, audiência ou sinais de engajamento antes de publicar.');
    }

    return issues.filter(Boolean);
  }

  private hasRemarketingInfrastructure(storeContext?: StoreAiContext): boolean {
    return (storeContext?.historicalContext.audienceSignals || []).some((signal) =>
      this.hasRemarketingAudienceSignals(signal),
    );
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

  private normalizeStructuredObjective(
    value: unknown,
    prompt: string,
  ): AiCampaignObjective | null {
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

    return this.inferExpectedObjective(prompt);
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
    const amount = this.parseBudgetValue(candidate.amount ?? budget);

    return {
      type,
      amount: amount && amount > 0 ? amount : null,
      currency: 'BRL',
    };
  }

  private normalizeStructuredCta(value: unknown): string {
    return this.normalizeCtaValue(value) || '';
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

  private normalizeStructuredTargeting(
    targeting: unknown,
    prompt: string,
  ): AiAdSetOutput['targeting'] {
    const candidate = typeof targeting === 'object' && targeting !== null ? targeting as Record<string, unknown> : {};
    const gender = this.normalizeStructuredGender(candidate.gender);
    const ageMin = this.normalizeStructuredAge(candidate.ageMin);
    const ageMax = this.normalizeStructuredAge(candidate.ageMax);
    const normalizedCountry = this.normalizeCountry(candidate.country);
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
      interests: this.normalizeArrayOfStrings(candidate.interests, 8),
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

  private normalizeAudienceSummary(
    audience: unknown,
    targeting: AiAdSetOutput['targeting'],
  ): { gender: AiGenderOutput | null; ageRange: string | null; interests: string[] } {
    const candidate = this.normalizeAudienceSource(audience);
    const gender = this.normalizeStructuredGender((candidate as Record<string, unknown>)?.gender) || targeting.gender;
    const explicitAgeRange = this.normalizeAudienceAgeRange(candidate);
    const ageRange = explicitAgeRange
      || (typeof targeting.ageMin === 'number' && typeof targeting.ageMax === 'number'
        ? `${targeting.ageMin}-${targeting.ageMax}`
        : null);
    const interests = this.normalizeStringArrayUnique(
      Array.isArray((candidate as Record<string, unknown>)?.interests)
        ? (candidate as Record<string, unknown>).interests
        : this.normalizeArrayOrDelimitedString((candidate as Record<string, unknown>)?.interests),
      6,
    );

    return {
      gender,
      ageRange,
      interests,
    };
  }

  private firstObject(...values: unknown[]): Record<string, unknown> {
    return values.find((value) => !!value && typeof value === 'object' && !Array.isArray(value)) as Record<string, unknown> || {};
  }

  private normalizeArrayOrDelimitedString(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.asString(item)).filter(Boolean);
    }

    const text = this.asString(value);
    if (!text) {
      return [];
    }

    return text
      .split(/\n|;|,|•| - /)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeAudienceSource(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      return {
        summary: value.trim(),
        interests: this.normalizeArrayOrDelimitedString(value),
      };
    }

    const candidate = this.firstObject(value);
    const ageRangeObject = this.firstObject(candidate.ageRange);
    const min = this.normalizePositiveNumber(ageRangeObject.min ?? candidate.ageMin);
    const max = this.normalizePositiveNumber(ageRangeObject.max ?? candidate.ageMax);
    const ageRange = this.asString(candidate.ageRange) || (
      min !== null || max !== null
        ? `${min ?? 18}-${max ?? 65}`
        : ''
    );

    return {
      ...candidate,
      interests: Array.isArray(candidate.interests)
        ? candidate.interests
        : this.normalizeArrayOrDelimitedString(candidate.interests ?? candidate.summary),
      ageRange,
      ageMin: min,
      ageMax: max,
    };
  }

  private normalizeAudienceAgeRange(value: unknown): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized || null;
    }

    const candidate = this.firstObject(value);
    const direct = this.normalizeOptionalStructuredText(candidate.ageRange, 80);
    if (direct) {
      return direct;
    }

    const min = this.normalizePositiveNumber(candidate.ageMin ?? this.firstObject(candidate.ageRange).min);
    const max = this.normalizePositiveNumber(candidate.ageMax ?? this.firstObject(candidate.ageRange).max);
    return min !== null || max !== null ? `${min ?? 18}-${max ?? 65}` : null;
  }

  private normalizeBudgetSource(value: unknown, budgetType?: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {
      type: this.asString(budgetType) || 'daily',
      amount: value,
      currency: 'BRL',
    };
  }

  private normalizeTargetingSource(value: unknown): Record<string, unknown> {
    const candidate = this.normalizeAudienceSource(value);
    return {
      ...candidate,
      interests: Array.isArray(candidate.interests) ? candidate.interests : this.normalizeArrayOrDelimitedString(candidate.interests),
      excludedInterests: Array.isArray(candidate.excludedInterests) ? candidate.excludedInterests : this.normalizeArrayOrDelimitedString(candidate.excludedInterests),
    };
  }

  private extractBudgetAmountFromNormalizedPayload(payload: Record<string, unknown>): number | null {
    const campaign = this.firstObject(payload.campaign);
    const campaignBudget = this.firstObject(campaign.budget);
    return this.asNullableInteger(
      campaignBudget.amount
      ?? this.firstObject(payload.intent).budgetAmount
      ?? payload.budgetSuggestion
      ?? payload.budget,
    );
  }

  private parseBudgetValue(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value : null;
    }

    const text = this.asString(value);
    if (!text) {
      return null;
    }

    const contextualPatterns = [
      /(?:or[cç]amento|orcamento|budget|investimento|verba|valor)[^\d]{0,24}(r\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)/i,
      /r\$\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)/i,
      /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)\s*(?:por dia|\/dia|ao dia|di[aá]ri[oa])/i,
      /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?)\s*(?:por campanha|campanha inteira|total)/i,
    ];
    for (const pattern of contextualPatterns) {
      const match = text.match(pattern);
      const candidate = match?.[2] || match?.[1];
      const parsed = this.parseLocalizedBudgetCandidate(candidate);
      if (parsed !== null) {
        return parsed;
      }
    }

    if (!/^[\d\s.,-]+$/.test(text)) {
      return null;
    }

    const cleaned = text
      .replace(/r\$/gi, '')
      .replace(/por dia|\/dia|di[aá]rio|diaria|diário/gi, '')
      .replace(/[^\d,.-]/g, '')
      .trim();

    if (!cleaned) {
      return null;
    }

    if (cleaned.includes(',') && cleaned.includes('.')) {
      const parsed = Number(cleaned.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    if (cleaned.includes(',') && !cleaned.includes('.')) {
      const commaParts = cleaned.split(',');
      if (commaParts[1] && commaParts[1].length === 2) {
        const parsed = Number(cleaned.replace(',', '.'));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      }
      return this.normalizePositiveNumber(cleaned.replace(/,/g, ''));
    }

    return this.normalizePositiveNumber(cleaned);
  }

  private parseLocalizedBudgetCandidate(value: unknown): number | null {
    const text = this.asString(value).replace(/\s+/g, '');
    if (!text) {
      return null;
    }

    if (text.includes(',') && text.includes('.')) {
      const parsed = Number(text.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    if (text.includes(',') && !text.includes('.')) {
      const commaParts = text.split(',');
      if (commaParts[1] && commaParts[1].length === 2) {
        const parsed = Number(text.replace(',', '.'));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      }
      return this.normalizePositiveNumber(text.replace(/,/g, ''));
    }

    return this.normalizePositiveNumber(text);
  }

  private normalizeCtaValue(value: unknown): string | null {
    const normalized = this.normalizeOptionalStructuredText(value, 60)?.toLowerCase() || '';
    if (!normalized) {
      return null;
    }

    if (/(whatsapp|falar no whatsapp|fale conosco no whatsapp|chamar no whatsapp|conversar|mensagens|mensagem|direct|inbox|messenger|chamar agora|message page|message us|enviar mensagem|mandar mensagem)/i.test(normalized)) {
      return 'MESSAGE_PAGE';
    }
    if (/(saiba mais|learn more)/i.test(normalized)) return 'LEARN_MORE';
    if (/(fale conosco|contact us|entre em contato)/i.test(normalized)) return 'CONTACT_US';
    if (/(comprar agora|shop now)/i.test(normalized)) return 'SHOP_NOW';

    const upper = normalized.toUpperCase();
    if (['LEARN_MORE', 'CONTACT_US', 'SHOP_NOW', 'MESSAGE_PAGE', 'SIGN_UP', 'BOOK_NOW', 'DOWNLOAD'].includes(upper)) {
      return upper;
    }

    return null;
  }

  private hasUsefulAudience(value: unknown): boolean {
    if (typeof value === 'string') {
      return value.trim().length >= 3;
    }

    const candidate = this.firstObject(value);
    const interests = this.normalizeArrayOrDelimitedString(candidate.interests);
    const summary = this.asString(candidate.summary);
    const ageRange = this.normalizeAudienceAgeRange(candidate);
    const city = this.asString(candidate.city);
    const state = this.asString(candidate.state);

    return !!(interests.length || summary || ageRange || city || state);
  }

  private normalizeExplanationOutput(
    explanation: unknown,
    storeContext: StoreAiContext | undefined,
    planner: AiPlannerOutput,
    campaign: AiCampaignOutput,
    adSet: AiAdSetOutput,
    creative: AiCreativeOutput,
    strategy: string,
  ): { strategy: string; audience: string; copy: string; budget: string } {
    const candidate = typeof explanation === 'object' && explanation !== null ? explanation as Record<string, unknown> : {};

    return {
      strategy: this.normalizeStructuredText(
        candidate.strategy,
        strategy,
        220,
      ),
      audience: this.normalizeStructuredText(
        candidate.audience,
        `O público foi pensado para ${planner.audienceIntent || storeContext?.targetAudience || 'pessoas com intenção real de resposta'}, usando ${adSet.targeting.interests.slice(0, 3).join(', ') || 'interesses do contexto da store'}.`,
        220,
      ),
      copy: this.normalizeStructuredText(
        candidate.copy,
        `A mensagem prioriza ${planner.goal || 'um próximo passo claro'}, destaca ${creative.headline || 'o benefício principal'} e evita promessas não confirmadas.`,
        220,
      ),
      budget: this.normalizeStructuredText(
        candidate.budget,
        `${campaign.budget.amount ? `O orçamento sugerido começa em R$ ${campaign.budget.amount}` : 'O orçamento precisa ser revisado'} para testar a campanha sem extrapolar o contexto disponível.`,
        220,
      ),
    };
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
      storeContext?.website ? `Website identificado: ${storeContext.website}.` : '',
      storeContext?.dataAvailability.hasConnectedMetaAccount ? 'Conta Meta conectada disponível.' : '',
      storeContext?.dataAvailability.hasConnectedPage ? 'Página Meta conectada disponível.' : '',
      storeContext?.historicalContext?.campaignCount
        ? `${storeContext.historicalContext.campaignCount} campanha(s) histórica(s) recente(s) entraram como contexto qualitativo.`
        : 'Não há histórico real de campanhas disponível para esta recomendação.',
      storeContext?.dataAvailability.hasPerformanceMetrics
        ? `Métricas agregadas disponíveis: CTR ${storeContext?.historicalContext?.metrics?.ctr ?? 'n/d'}, CPA ${storeContext?.historicalContext?.metrics?.cpa ?? 'n/d'} e ROAS ${storeContext?.historicalContext?.metrics?.roas ?? 'n/d'}.`
        : 'Não há métricas reais de performance disponíveis para esta recomendação.',
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

  private extractPromptBriefing(prompt: string): ExtractedPromptBriefing {
    const destinationType = this.detectDestinationTypeFromText(prompt);
    const objective = destinationType === 'messages'
      ? 'OUTCOME_LEADS'
      : this.inferExpectedObjective(prompt);
    const segment = this.inferVertical(prompt);
    const rawRegion = this.inferRegionText(prompt);
    const region = /\bbrasil\b/i.test(prompt)
      ? 'Brasil'
      : this.normalizePromptLocation(rawRegion);
    const city = region && region !== 'Brasil'
      ? region
      : this.normalizePromptLocation(this.inferCityText(prompt));

    return {
      goal: this.firstSpecificText(this.inferFallbackObjective(prompt)),
      objective,
      budget: this.parseBudgetValue(prompt),
      budgetType: /por dia|\/dia|di[aá]ri/i.test(prompt)
        ? 'daily'
        : /total|campanha inteira|vital/i.test(prompt)
        ? 'lifetime'
        : null,
      destinationType,
      segment: segment !== 'negócio' ? segment : null,
      region,
      city,
      funnelStage: this.normalizeFunnelStage(undefined, prompt),
      channelPreference: this.inferChannelPreference(prompt),
      primaryOffer: this.inferMainOffer(prompt) || null,
      remarketingExpected: /(remarketing|retargeting|reimpactar|visitantes|engajados|clientes)/i.test(prompt),
      cta: this.parsePromptCta(prompt),
    };
  }

  private parsePromptCta(prompt: string): string | null {
    const normalized = prompt.toUpperCase();
    const match = /CTA\s*[:-]?\s*(CONTACT_US|MESSAGE_PAGE|SHOP_NOW|LEARN_MORE|SIGN_UP|BOOK_NOW|DOWNLOAD)\b/.exec(normalized);
    return match ? match[1] : null;
  }

  private normalizePromptLocation(value: string | null): string | null {
    const normalized = this.asString(value)
      .replace(/\s+(com|cta|foco|objetivo|orcamento|orçamento)\b.*$/i, '')
      .replace(/[.,;:].*$/, '')
      .trim();
    if (/^(whatsapp|mensagens?|messenger|instagram|direct|site|website)$/i.test(normalized)) {
      return null;
    }
    return normalized || null;
  }

  private inferFallbackCta(
    prompt: string,
    storeContext?: StoreAiContext,
    constraints?: BriefingConstraints,
  ): string {
    if (constraints?.expectedCta) {
      return constraints.expectedCta;
    }
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

  private detectDestinationTypeFromText(text: string): CampaignDestinationType | null {
    if (this.hasMessageIntentSignal(text)) {
      return 'messages';
    }
    if (/(site|website|landing|ecommerce|loja online)/i.test(text)) {
      return 'site';
    }
    return null;
  }

  private resolveCampaignIntentDestinationType(value: unknown, sourceText: string): string | null {
    const explicit = this.normalizeCommercialDestinationType(value);
    if (explicit) {
      return explicit;
    }

    return this.hasMessageIntentSignal(sourceText)
      ? 'messages'
      : /(site|website|landing|ecommerce|loja online)/i.test(sourceText)
      ? 'site'
      : null;
  }

  private normalizeCommercialDestinationType(value: unknown): CampaignDestinationType | null {
    const normalized = this.asString(value).toLowerCase();
    if (!normalized) {
      return null;
    }

    if (['messages', 'whatsapp'].includes(normalized)) return 'messages';
    if (['website', 'site'].includes(normalized)) return 'site';
    if (['instagram', 'messenger'].includes(normalized)) return 'messages';
    if (['leads'].includes(normalized)) return 'messages';
    return null;
  }

  private hasExplicitMessageIntent(prompt: string, storeContext?: StoreAiContext): boolean {
    return this.hasMessageIntentSignal([
      prompt,
      storeContext?.campaignIntent.destinationType,
      storeContext?.campaignIntent.channelPreference,
      storeContext?.campaignIntent.goal,
      storeContext?.campaignIntent.extraContext,
    ].filter(Boolean).join(' '));
  }

  private hasMessageIntentSignal(text: string): boolean {
    return /(whatsapp|falar no whatsapp|chamar no whatsapp|conversar|mensagens|mensagem|direct|inbox|messenger|chamar agora|fale conosco|message page|message us)/i.test(text);
  }

  private inferChannelPreference(prompt: string): string | null {
    if (/(whatsapp|falar no whatsapp|chamar no whatsapp|conversar|mensagens|messenger|inbox|fale conosco|chamar agora)/i.test(prompt)) return 'messages';
    if (/direct|instagram/i.test(prompt)) return 'instagram';
    if (/formul[aá]rio|lead form|cadastro/i.test(prompt)) return 'leads';
    if (/site|landing|ecommerce|loja online/i.test(prompt)) return 'website';
    return null;
  }

  private formatBudgetRange(budget: unknown, prompt: string): string | null {
    const promptBudget = this.parseBudgetValue(prompt);
    if (promptBudget) {
      return `R$ ${promptBudget.toLocaleString('pt-BR')} informado no briefing.`;
    }
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

  private parseAggregateMetric(value: string | null | undefined): number | null {
    if (value == null || value === '') {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
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

  private inferCommunicationTone(text: string, businessType: string): string {
    const normalized = `${text} ${businessType}`.toLowerCase();
    if (/(premium|alto padr[aã]o|sofisticad|luxo|exclusiv)/i.test(normalized)) {
      return 'consultivo e premium, com sensação de exclusividade';
    }
    if (/(oferta|promo[cç][aã]o|desconto|urg[eê]ncia|agora)/i.test(normalized)) {
      return 'direto, claro e orientado à ação';
    }
    if (/(sa[úu]de|cl[ií]nica|diagn[oó]stico|jur[ií]dico|financeiro|consultoria)/i.test(normalized)) {
      return 'didático, confiável e humano';
    }
    return 'simples, próximo e focado no benefício principal';
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

  private buildFallbackDifferentialText(storeContext: StoreAiContext | undefined, segment: string): string {
    const differentiator = storeContext?.storeProfile.differentiators?.[0];
    if (differentiator) {
      return differentiator.slice(0, 120);
    }

    return `Destaque o principal diferencial de ${segment} para aumentar clareza e confiança.`.slice(0, 120);
  }

  private buildFallbackReasoningLines(
    storeContext: StoreAiContext | undefined,
    planner: AiPlannerOutput,
    campaign: AiCampaignOutput,
    adSet: AiAdSetOutput,
    creative: AiCreativeOutput,
  ): string[] {
    return [
      `A estratégia parte do contexto de ${storeContext?.segment || planner.businessType || 'negócio local'} e do objetivo ${planner.goal || campaign.objective || 'comercial'} informado.`,
      `O público foi desenhado com base em ${storeContext?.targetAudience || planner.audienceIntent || 'intenção de compra ou resposta'} e nos interesses ${adSet.targeting.interests.slice(0, 3).join(', ') || 'mais aderentes ao briefing'}.`,
      `A copy usa ${creative.headline || 'um benefício central'} como gancho para reduzir ambiguidade e facilitar o próximo passo.`,
      `${campaign.budget.amount ? `O orçamento de R$ ${campaign.budget.amount} foi tratado como ponto de partida.` : 'O orçamento precisa de revisão manual.'} A ideia é testar com segurança antes de escalar.`,
    ].filter(Boolean).slice(0, 6);
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

  private buildBriefingConstraints(prompt: string, storeContext?: StoreAiContext): BriefingConstraints {
    const referenceText = [
      prompt,
      storeContext?.campaignIntent.goal,
      storeContext?.campaignIntent.destinationType,
      storeContext?.campaignIntent.primaryOffer,
      storeContext?.segment,
    ].filter(Boolean).join(' ');
    const expectedSegment = this.inferVertical(referenceText);
    const expectedObjective = this.inferExpectedObjective(referenceText, storeContext?.campaignIntent.goal);
    const expectedBudget = this.parseBudgetValue(prompt)
      ?? this.parseBudgetValue(storeContext?.campaignIntent.budgetRange)
      ?? null;
    const expectedBudgetType = /por dia|\/dia|di[aá]ri/i.test(referenceText) ? 'daily'
      : /total|campanha inteira|vital/i.test(referenceText) ? 'lifetime'
      : null;
    const expectedDestinationType = /(whatsapp|mensagem|message|messenger|inbox|direct|conversa|fale conosco|chamar agora)/i.test(referenceText)
      ? 'messages'
      : /(site|website|landing|ecommerce|loja online)/i.test(referenceText)
      ? 'site'
      : null;
    const expectedCta = expectedDestinationType === 'messages'
      ? 'MESSAGE_PAGE'
      : /(comprar|shop now|ecommerce|loja online)/i.test(referenceText)
      ? 'SHOP_NOW'
      : expectedObjective === 'OUTCOME_LEADS'
      ? 'CONTACT_US'
      : null;

    return {
      expectedSegment: expectedSegment !== 'negócio' ? expectedSegment : null,
      expectedObjective,
      expectedBudget,
      expectedBudgetType,
      expectedCta,
      expectedDestinationType,
      expectsRemarketing: /(remarketing|retargeting|reimpactar|visitantes|engajados|clientes)/i.test(referenceText),
    };
  }

  private buildBriefingConstraintsPrioritizingPrompt(
    prompt: string,
    storeContext?: StoreAiContext,
  ): BriefingConstraints {
    const base = this.buildBriefingConstraints(prompt, storeContext);
    const promptBriefing = this.extractPromptBriefing(prompt);
    const fallbackText = [
      storeContext?.campaignIntent.goal,
      storeContext?.campaignIntent.destinationType,
      storeContext?.campaignIntent.primaryOffer,
      storeContext?.segment,
    ].filter(Boolean).join(' ');
    const fallbackSegment = this.inferVertical(fallbackText);
    const promptSegment = promptBriefing.segment
      ?? (fallbackSegment !== 'negócio' ? fallbackSegment : null);
    const promptDestinationType = promptBriefing.destinationType
      ?? this.detectDestinationTypeFromText(fallbackText)
      ?? base.expectedDestinationType;
    const promptObjective = promptBriefing.objective ?? base.expectedObjective;
    const promptBudgetType = promptBriefing.budgetType ?? base.expectedBudgetType;
    const promptCta = promptBriefing.cta
      ? promptBriefing.cta
      : promptDestinationType === 'messages'
      ? 'MESSAGE_PAGE'
      : /(comprar|shop now|ecommerce|loja online)/i.test(`${prompt} ${fallbackText}`)
      ? 'SHOP_NOW'
      : promptObjective === 'OUTCOME_LEADS'
      ? 'CONTACT_US'
      : base.expectedCta;

    return {
      expectedSegment: promptSegment !== 'negócio' ? promptSegment : null,
      expectedObjective: promptObjective,
      expectedBudget: promptBriefing.budget ?? base.expectedBudget,
      expectedBudgetType: promptBudgetType,
      expectedCta: promptCta,
      expectedDestinationType: promptDestinationType,
      expectsRemarketing: promptBriefing.remarketingExpected || base.expectsRemarketing,
    };
  }

  private buildCampaignIntent(prompt: string, storeContext?: StoreAiContext): DeterministicCampaignIntent {
    const constraints = this.buildBriefingConstraintsPrioritizingPrompt(prompt, storeContext);
    const destinationType = constraints.expectedDestinationType
      ?? this.normalizeCommercialDestinationType(storeContext?.campaignIntent.destinationType)
      ?? this.normalizeCommercialDestinationType(storeContext?.campaignIntent.channelPreference);
    const objective = destinationType === 'messages'
      ? 'OUTCOME_LEADS'
      : constraints.expectedObjective
      ?? this.inferExpectedObjective(
        [
          prompt,
          storeContext?.campaignIntent.goal,
          storeContext?.campaignIntent.destinationType,
        ].filter(Boolean).join(' '),
      );
    const budgetAmount = constraints.expectedBudget ?? this.deriveDeterministicBudgetAmount(objective, destinationType, storeContext);
    const budgetType = constraints.expectedBudgetType ?? (budgetAmount ? 'daily' : null);
    const channel = this.firstSpecificText(
      this.inferChannelPreference(prompt),
      storeContext?.campaignIntent.channelPreference,
      storeContext?.campaignIntent.destinationType,
    );
    const segment = this.firstSpecificText(constraints.expectedSegment, storeContext?.segment);
    const offer = this.firstSpecificText(storeContext?.campaignIntent.primaryOffer, storeContext?.storeProfile.mainOffer);
    const remarketingExpected = constraints.expectsRemarketing
      || ['remarketing', 'retention'].includes(this.asString(storeContext?.campaignIntent.funnelStage).toLowerCase());
    const websiteAvailable = !!this.normalizeHttpsUrl(storeContext?.website);
    const whatsappAvailable = !!this.asString(storeContext?.whatsapp);
    const instagramAvailable = !!this.asString(storeContext?.instagram);
    const pageConnected = !!storeContext?.dataAvailability.hasConnectedPage;
    const messageDestinationAvailable = pageConnected || whatsappAvailable || instagramAvailable;

    return {
      objective: objective || null,
      destinationType: destinationType || null,
      funnelStage: this.normalizeStructuredFunnelStage(storeContext?.campaignIntent.funnelStage, prompt),
      budgetAmount,
      budgetType,
      region: this.firstSpecificText(
        this.extractPromptBriefing(prompt).region,
        storeContext?.campaignIntent.region,
        storeContext?.storeProfile.region,
      ),
      segment,
      offer,
      channel,
      cta: this.resolveDeterministicIntentCta(objective, destinationType, prompt),
      remarketingExpected,
      messageDestinationAvailable,
      websiteAvailable,
      metaConnected: !!storeContext?.dataAvailability.hasConnectedMetaAccount,
      pageConnected,
      whatsappAvailable,
      instagramAvailable,
    };
  }

  private deriveDeterministicBudgetAmount(
    objective: AiCampaignObjective | null,
    destinationType: CampaignDestinationType | null,
    storeContext?: StoreAiContext,
  ): number | null {
    if (storeContext?.campaignIntent.budgetRange) {
      const parsed = this.parseBudgetValue(storeContext.campaignIntent.budgetRange);
      if (parsed) {
        return parsed;
      }
    }

    const salesModel = storeContext?.storeProfile.salesModel;
    if (destinationType === 'messages') {
      return salesModel === 'local' ? 80 : 100;
    }
    if (objective === 'REACH') {
      return 70;
    }
    if (objective === 'OUTCOME_TRAFFIC') {
      return salesModel === 'ecommerce' ? 120 : 90;
    }
    if (objective === 'OUTCOME_LEADS') {
      return salesModel === 'local' ? 80 : 100;
    }
    return null;
  }

  private resolveDeterministicIntentCta(
    objective: AiCampaignObjective | null,
    destinationType: CampaignDestinationType | null,
    prompt: string,
  ): string | null {
    if (destinationType === 'messages') {
      return 'MESSAGE_PAGE';
    }
    if (destinationType === 'site' && /(comprar|shop now|ecommerce|loja online)/i.test(prompt)) {
      return 'SHOP_NOW';
    }
    if (objective === 'OUTCOME_LEADS') {
      return 'CONTACT_US';
    }
    if (objective === 'OUTCOME_TRAFFIC') {
      return 'LEARN_MORE';
    }
    return null;
  }

  private inferExpectedObjective(text: string, goal?: string | null): AiCampaignObjective | null {
    const normalized = `${text} ${goal || ''}`;
    if (/(lead|leads|cadastro|capta|whatsapp|mensagem|conversa|messenger|inbox|direct|formul[aá]rio|fale conosco)/i.test(normalized)) {
      return 'OUTCOME_LEADS';
    }
    if (/(alcance|awareness|reconhecimento)/i.test(normalized)) {
      return 'REACH';
    }
    if (/(tr[aá]fego|cliques|visitas|site|ecommerce|loja online)/i.test(normalized)) {
      return 'OUTCOME_TRAFFIC';
    }
    return null;
  }

  private normalizeStructuredInterests(values: string[], constraints?: BriefingConstraints): string[] {
    const normalized = this.normalizeStringArrayUnique(values, 8);
    if (!constraints?.expectsRemarketing) {
      return normalized;
    }
    return normalized;
  }

  private hasRemarketingAudienceSignals(value: string): boolean {
    return /(remarketing|retargeting|visitantes|engajados|clientes|carrinho|recorrente|site visitors|custom audience|audiencia personalizada|pixel)/i.test(value);
  }

  private sanitizeAudienceForRemarketing(
    targeting: AiAdSetOutput['targeting'],
    constraints: BriefingConstraints,
    plannerAudienceIntent?: string | null,
  ): {
    targeting: AiAdSetOutput['targeting'];
    warnings: string[];
    recommendations: string[];
    sanitized: boolean;
  } {
    if (!constraints.expectsRemarketing) {
      return {
        targeting,
        warnings: [],
        recommendations: [],
        sanitized: false,
      };
    }

    const normalizedInterests = this.normalizeStructuredInterests(targeting.interests, constraints);
    const audienceText = `${plannerAudienceIntent || ''} ${normalizedInterests.join(', ')}`.trim();
    if (!normalizedInterests.length || this.hasRemarketingAudienceSignals(audienceText)) {
      return {
        targeting: {
          ...targeting,
          interests: normalizedInterests,
        },
        warnings: [],
        recommendations: [],
        sanitized: false,
      };
    }

    return {
      targeting: {
        ...targeting,
        interests: [],
      },
      warnings: [
        'Os interesses sugeridos vieram como público frio, então foram removidos do targeting final até existir uma audiência real de remarketing.',
      ],
      recommendations: [
        'Configure uma audiência personalizada, pixel ou sinais reais de engajamento antes de definir o público de remarketing.',
      ],
      sanitized: true,
    };
  }

  private validateSuggestionConsistency(
    constraints: BriefingConstraints,
    suggestion: {
      strategy: string;
      primaryText: string;
      headline: string;
      description: string;
      cta: string;
      audience: AiCampaignAudienceSummary;
      planner: AiPlannerOutput;
      campaign: AiCampaignOutput;
      adSet: AiAdSetOutput;
      creative: AiCreativeOutput;
    },
    normalizedPayload: Record<string, unknown>,
  ): {
    blockingIssues: string[];
    warnings: string[];
    recommendations: string[];
    shouldRetry: boolean;
    userMessage?: string;
    debug?: ConsistencyDebugInfo;
  } {
    const combinedText = [
      suggestion.strategy,
      suggestion.primaryText,
      suggestion.headline,
      suggestion.description,
      suggestion.planner.audienceIntent,
      suggestion.campaign.campaignName,
      suggestion.adSet.name,
      suggestion.audience.interests.join(', '),
      suggestion.adSet.targeting.interests.join(', '),
      JSON.stringify(normalizedPayload),
    ].join(' ');
    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const failedRules: string[] = [];
    const rawModelBudget = this.extractBudgetAmountFromNormalizedPayload(normalizedPayload);
    const detectedDestinationType = this.isHttpsUrl(suggestion.creative.destinationUrl) ? 'site' : 'messages';
    const detectedSegment = this.inferVertical(combinedText);
    const detectedCta = suggestion.creative.cta || suggestion.cta;
    const detectedBudgetType = suggestion.campaign.budget.type;
    const detectedBudgetAmount = suggestion.campaign.budget.amount;
    const immutableFieldMismatches: string[] = [];

    if (this.containsRawJsonArtifact(suggestion.primaryText)
      || this.containsRawJsonArtifact(suggestion.headline)
      || this.containsRawJsonArtifact(suggestion.strategy)
      || this.containsRawJsonArtifact(suggestion.description)) {
      blockingIssues.push('A resposta da IA trouxe JSON bruto ou texto corrompido em campos de copy.');
      failedRules.push('raw_json_in_copy');
    }
    if (!suggestion.campaign.campaignName?.trim()) {
      blockingIssues.push('A IA não retornou um nome de campanha utilizável.');
    }
    if (!suggestion.creative.primaryText?.trim()) {
      blockingIssues.push('A IA não retornou primaryText utilizável.');
    }
    if (!suggestion.creative.headline?.trim()) {
      blockingIssues.push('A IA não retornou headline utilizável.');
    }
    if (!suggestion.campaign.objective?.trim()) {
      blockingIssues.push('A IA não retornou um objetivo de campanha utilizável.');
    }
    if (!suggestion.campaign.budget.amount || suggestion.campaign.budget.amount <= 0) {
      blockingIssues.push('A IA não retornou um orçamento utilizável.');
    }
    if (!suggestion.creative.cta?.trim() && !suggestion.cta?.trim()) {
      blockingIssues.push('A IA não retornou CTA utilizável.');
    }
    if (!suggestion.planner.audienceIntent?.trim()
      && !suggestion.audience.interests.length
      && !suggestion.adSet.targeting.interests.length
      && !suggestion.adSet.targeting.city?.trim()) {
      blockingIssues.push('A IA não retornou público utilizável.');
    }
    if (constraints.expectedSegment) {
      if (detectedSegment !== 'negócio' && detectedSegment !== constraints.expectedSegment) {
        blockingIssues.push(`A IA desviou do segmento esperado no briefing (${constraints.expectedSegment}).`);
        failedRules.push('segment_mismatch');
        immutableFieldMismatches.push('segment');
      }
    }
    if (
      constraints.expectedBudget
      && (
        (detectedBudgetAmount && detectedBudgetAmount !== constraints.expectedBudget)
        || (rawModelBudget && rawModelBudget !== constraints.expectedBudget)
      )
    ) {
      blockingIssues.push(`A IA alterou o orçamento informado no briefing (esperado R$ ${constraints.expectedBudget}).`);
      failedRules.push('budget_mismatch');
      immutableFieldMismatches.push('budgetAmount');
    }
    if (constraints.expectedBudgetType && detectedBudgetType !== constraints.expectedBudgetType) {
      blockingIssues.push(`A IA alterou o tipo de orçamento informado no briefing (${constraints.expectedBudgetType}).`);
      failedRules.push('budget_type_mismatch');
      immutableFieldMismatches.push('budgetType');
    }
    if (constraints.expectedObjective && suggestion.campaign.objective !== constraints.expectedObjective) {
      blockingIssues.push(`A IA alterou o objetivo principal do briefing (${constraints.expectedObjective}).`);
      failedRules.push('objective_mismatch');
      immutableFieldMismatches.push('objective');
    }
    if (constraints.expectedCta && detectedCta !== constraints.expectedCta) {
      // For message campaigns, we always normalize the CTA to MESSAGE_PAGE deterministically,
      // so a CTA mismatch is not a blocking issue - it will be corrected automatically.
      const isMessageCampaign = constraints.expectedDestinationType === 'messages' 
        && constraints.expectedCta === 'MESSAGE_PAGE';
      
      if (!isMessageCampaign) {
        blockingIssues.push(`A IA gerou CTA incompatível com o briefing (${constraints.expectedCta}).`);
        failedRules.push('cta_mismatch');
        immutableFieldMismatches.push('cta');
      } else {
        // For message campaigns, just warn about the CTA mismatch since we'll normalize it
        warnings.push(`A IA retornou CTA diferente (${detectedCta}), mas será normalizado para MESSAGE_PAGE em campanhas de mensagens.`);
      }
    }
    if (constraints.expectedDestinationType && detectedDestinationType !== constraints.expectedDestinationType) {
      if (constraints.expectedDestinationType === 'messages' && detectedDestinationType === 'site') {
        warnings.push('A IA sugeriu URL de site, mas o briefing pede WhatsApp/mensagens. O destino externo será descartado e a campanha seguirá apenas como rascunho em revisão.');
      } else {
        blockingIssues.push(
          constraints.expectedDestinationType === 'site'
            ? 'A IA mudou o destino esperado de site para mensagens/WhatsApp.'
            : 'A IA mudou o destino esperado de mensagens/WhatsApp para site.',
        );
        failedRules.push('destination_mismatch');
        immutableFieldMismatches.push('destinationType');
      }
    }
    if (constraints.expectedDestinationType === 'site' && !this.isHttpsUrl(suggestion.creative.destinationUrl)) {
      blockingIssues.push('A IA não forneceu destinationUrl em HTTPS para a campanha de site.');
      failedRules.push('destination_url_missing');
      if (!immutableFieldMismatches.includes('destinationType')) {
        immutableFieldMismatches.push('destinationType');
      }
    }
    if (constraints.expectedDestinationType === 'messages'
      && suggestion.creative.destinationUrl
      && this.isHttpsUrl(suggestion.creative.destinationUrl)) {
      warnings.push('O briefing indica mensagens/WhatsApp, mas a sugestão ainda trouxe URL de destino externa.');
    }
    if (constraints.expectsRemarketing) {
      const remarketingSignals = /(remarketing|retargeting|visitantes|engajados|clientes|carrinho|recorrente)/i;
      const audienceText = `${suggestion.planner.audienceIntent || ''} ${suggestion.audience.interests.join(', ')} ${suggestion.adSet.targeting.interests.join(', ')}`;
      if (!remarketingSignals.test(audienceText)) {
        blockingIssues.push('O briefing pede remarketing, mas o público sugerido não reflete esse contexto.');
        failedRules.push('audience_mismatch');
      }
    }

    if (blockingIssues.length) {
      recommendations.push('Gere novamente a sugestão com a IA para obter uma resposta coerente com o briefing.');
    }

    const immutableFieldError = immutableFieldMismatches.length
      ? 'A resposta anterior foi rejeitada porque alterou campos imutáveis do briefing. Gere novamente preservando exatamente os campos esperados.'
      : undefined;

    return {
      blockingIssues,
      warnings,
      recommendations,
      shouldRetry: blockingIssues.length > 0,
      userMessage: blockingIssues.length
        ? immutableFieldError || 'A IA respondeu com dados incompatíveis com o briefing. Gere novamente antes de aplicar qualquer sugestão.'
        : undefined,
      debug: {
        consistencyErrors: blockingIssues,
        expectedBriefingSignals: {
          expectedSegment: constraints.expectedSegment,
          expectedObjective: constraints.expectedObjective,
          expectedBudget: constraints.expectedBudget,
          expectedBudgetType: constraints.expectedBudgetType,
          expectedCta: constraints.expectedCta,
          expectedDestinationType: constraints.expectedDestinationType,
          expectsRemarketing: constraints.expectsRemarketing,
        },
        detectedResponseSignals: {
          objective: suggestion.campaign.objective,
          budget: suggestion.campaign.budget.amount,
          rawModelBudget,
          budgetType: suggestion.campaign.budget.type,
          cta: detectedCta,
          destinationUrl: suggestion.creative.destinationUrl,
          destinationType: detectedDestinationType,
          segment: detectedSegment,
          audience: {
            gender: suggestion.audience.gender,
            ageRange: suggestion.audience.ageRange,
            interests: suggestion.audience.interests,
            targetingInterests: suggestion.adSet.targeting.interests,
            city: suggestion.adSet.targeting.city,
          },
        },
        failedRules,
        immutableFieldsExpected: {
          objective: constraints.expectedObjective,
          budgetAmount: constraints.expectedBudget,
          budgetType: constraints.expectedBudgetType,
          cta: constraints.expectedCta,
          destinationType: constraints.expectedDestinationType,
          segment: constraints.expectedSegment,
          campaignType: 'AUCTION',
          storeId: null,
        },
        immutableFieldsReceived: {
          objective: suggestion.campaign.objective,
          budgetAmount: detectedBudgetAmount,
          budgetType: detectedBudgetType,
          cta: detectedCta,
          destinationType: detectedDestinationType,
          segment: detectedSegment,
          campaignType: suggestion.campaign.buyingType,
          storeId: null,
        },
        immutableFieldMismatches,
      },
    };
  }

  private postProcessConsistencyForRemarketing(
    consistency: {
      blockingIssues: string[];
      warnings: string[];
      recommendations: string[];
      shouldRetry: boolean;
      userMessage?: string;
      debug?: ConsistencyDebugInfo;
    },
    constraints: BriefingConstraints,
    sanitizedColdAudience = false,
  ): {
    blockingIssues: string[];
    warnings: string[];
    recommendations: string[];
    shouldRetry: boolean;
    userMessage?: string;
    debug?: ConsistencyDebugInfo;
  } {
    const failedRules = consistency.debug?.failedRules || [];
    const remarketingMismatchOnly = constraints.expectsRemarketing
      && failedRules.length === 1
      && failedRules[0] === 'audience_mismatch';

    if (!remarketingMismatchOnly) {
      return consistency;
    }

    const blockingIssue = 'O briefing pede remarketing, mas ainda falta selecionar ou conectar um público de remarketing/pixel/audiência personalizada.';
    const blockingIssues = consistency.blockingIssues.length
      ? consistency.blockingIssues.map((issue) => failedRules.includes('audience_mismatch') ? blockingIssue : issue)
      : [blockingIssue];

    return {
      ...consistency,
      blockingIssues,
      warnings: this.normalizeStringArrayUnique(
        [
          ...consistency.warnings,
          sanitizedColdAudience
            ? 'Os interesses sugeridos vieram como público frio, então foram removidos do targeting final até existir uma audiência real de remarketing.'
            : '',
        ],
        8,
      ),
      recommendations: this.normalizeStringArrayUnique(
        [
          ...consistency.recommendations.filter(
            (item) => item !== 'Gere novamente a sugestão com a IA para obter uma resposta coerente com o briefing.',
          ),
          'Configure uma audiência personalizada, pixel ou sinais reais de engajamento antes de publicar o remarketing.',
        ],
        8,
      ),
      shouldRetry: false,
      userMessage: undefined,
      debug: consistency.debug
        ? {
          ...consistency.debug,
          consistencyErrors: blockingIssues,
        }
        : consistency.debug,
    };
  }

  private containsRawJsonArtifact(value: string | null | undefined): boolean {
    const text = this.asString(value);
    if (!text) return false;
    return /```|^\s*[{[]|"\w+"\s*:|[}\]]\s*$/.test(text);
  }
}


