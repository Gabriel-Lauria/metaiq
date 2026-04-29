import { Injectable, Logger } from '@nestjs/common';
import { CreateMetaCampaignDto } from './dto/meta-integration.dto';
import { MetaGraphApiClient } from './meta-graph-api.client';
import { buildMetaGeoLocations, normalizeCampaignLocation } from './meta-audience-location.util';
import { buildMetaCreativePayload } from './meta-creative.validation';
import { MetaImageUploadService } from './meta-image-upload.service';

export interface MetaCampaignResourceIds {
  campaignId?: string;
  adSetId?: string;
  creativeId?: string;
  adId?: string;
}

export type MetaCampaignOrchestratorStep = 'campaign' | 'adset' | 'creative' | 'ad';

type MetaAdSetPayload = Record<string, string | number>;

@Injectable()
export class MetaCampaignOrchestrator {
  private readonly logger = new Logger(MetaCampaignOrchestrator.name);

  constructor(
    private readonly graphApi: MetaGraphApiClient,
    private readonly metaImageUpload: MetaImageUploadService,
  ) {}

  async createResources(input: {
    adAccountExternalId: string;
    accessToken: string;
    dto: CreateMetaCampaignDto;
    pageId: string;
    destinationUrl: string;
    objective: string;
    requestId?: string;
    executionId?: string;
    storeId?: string;
    onStepCreated: (step: MetaCampaignOrchestratorStep, ids: MetaCampaignResourceIds) => Promise<void>;
  }): Promise<Required<MetaCampaignResourceIds>> {
    const ids: MetaCampaignResourceIds = {};
    const accountPath = input.adAccountExternalId.trim();
    const desiredStatus = input.dto.initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
    const normalizedLocation = normalizeCampaignLocation(input.dto);
    const geoLocations = buildMetaGeoLocations(normalizedLocation);
    const campaignPayload = this.buildCampaignPayload(input.dto, input.objective, desiredStatus);

    this.assertCampaignPayload(campaignPayload);
    this.logStepPayload('META_GRAPH_API_REQUEST', `${accountPath}/campaigns`, 'campaign', campaignPayload, {
      executionId: input.executionId,
      storeId: input.storeId,
      adAccountExternalId: accountPath,
      requestId: input.requestId,
    });

    const campaign = await this.graphApi.post<{ id: string }>(
      `${accountPath}/campaigns`,
      input.accessToken,
      campaignPayload,
    );

    ids.campaignId = this.assertMetaId(campaign, 'campaigns');
    await input.onStepCreated('campaign', ids);
    const adSetPayload = this.buildAdSetPayload(input.dto, ids.campaignId, geoLocations, desiredStatus);
    this.assertAdSetPayload(adSetPayload);

    this.logAdSetPayload('META_GRAPH_API_REQUEST', `${accountPath}/adsets`, adSetPayload, normalizedLocation, {
      executionId: input.executionId,
      storeId: input.storeId,
      adAccountExternalId: accountPath,
      requestId: input.requestId,
    });

    const adSet = await this.graphApi.post<{ id: string }>(
      `${accountPath}/adsets`,
      input.accessToken,
      adSetPayload,
    );

    ids.adSetId = this.assertMetaId(adSet, 'adsets');
    await input.onStepCreated('adset', ids);

    const imageHash = await this.metaImageUpload.uploadImageFromUrl(
      input.accessToken,
      accountPath,
      input.dto.imageUrl,
      {
        requestId: input.requestId,
        executionId: input.executionId,
        storeId: input.storeId,
        adAccountExternalId: accountPath,
      },
    );

    const creativePayload = buildMetaCreativePayload({
      campaignName: input.dto.name,
      pageId: input.pageId,
      destinationUrl: input.destinationUrl,
      message: input.dto.message,
      headline: input.dto.headline,
      description: input.dto.description,
      imageUrl: input.dto.imageUrl,
      imageHash,
      cta: input.dto.cta,
    });

    this.logCreativePayload('META_GRAPH_API_REQUEST', `${accountPath}/adcreatives`, creativePayload, {
      requestId: input.requestId,
      executionId: input.executionId,
      storeId: input.storeId,
      adAccountExternalId: accountPath,
    });

    const creative = await this.graphApi.post<{ id: string }>(
      `${accountPath}/adcreatives`,
      input.accessToken,
      creativePayload,
    );

    ids.creativeId = this.assertMetaId(creative, 'adcreatives');
    await input.onStepCreated('creative', ids);

    const adPayload = {
      name: `${input.dto.name.trim()} - Ad`,
      adset_id: ids.adSetId,
      creative: JSON.stringify({ creative_id: ids.creativeId }),
      status: desiredStatus,
    };
    this.assertAdPayload(adPayload);
    this.logStepPayload('META_GRAPH_API_REQUEST', `${accountPath}/ads`, 'ad', adPayload, {
      executionId: input.executionId,
      storeId: input.storeId,
      adAccountExternalId: accountPath,
      requestId: input.requestId,
    });

    const ad = await this.graphApi.post<{ id: string }>(
      `${accountPath}/ads`,
      input.accessToken,
      adPayload,
    );

    ids.adId = this.assertMetaId(ad, 'ads');
    await input.onStepCreated('ad', ids);

    return ids as Required<MetaCampaignResourceIds>;
  }

  private assertMetaId(response: { id?: string }, edge: string): string {
    if (!response?.id) {
      throw new Error(`Meta não retornou ID ao criar ${edge}`);
    }

    return response.id;
  }

  /**
   * Retoma uma criação de campanha a partir de um ponto específico
   * Útil para recuperar de falhas parciais (ex: campaign criado mas adset falhou)
   */
  async resumeCreation(input: {
    adAccountExternalId: string;
    accessToken: string;
    dto: CreateMetaCampaignDto;
    pageId: string;
    destinationUrl: string;
    objective: string;
    startingIds: Partial<MetaCampaignResourceIds>;
    requestId?: string;
    executionId?: string;
    storeId?: string;
    onStepCreated: (step: MetaCampaignOrchestratorStep, ids: MetaCampaignResourceIds) => Promise<void>;
  }): Promise<Required<MetaCampaignResourceIds>> {
    const ids: MetaCampaignResourceIds = { ...input.startingIds };
    const accountPath = input.adAccountExternalId.trim();
    const desiredStatus = input.dto.initialStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';

    // Se campaign não existe, criar do zero (equivalente a createResources)
    if (!ids.campaignId) {
      return this.createResources(input);
    }

    // Campaign existe, tentar criar adset se não existe
    if (!ids.adSetId) {
      const normalizedLocation = normalizeCampaignLocation(input.dto);
      const geoLocations = buildMetaGeoLocations(normalizedLocation);
      const adSetPayload = this.buildAdSetPayload(input.dto, ids.campaignId, geoLocations, desiredStatus);
      this.assertAdSetPayload(adSetPayload);

      this.logAdSetPayload('META_GRAPH_API_RESUME_REQUEST', `${accountPath}/adsets`, adSetPayload, normalizedLocation, {
        executionId: input.executionId,
        storeId: input.storeId,
        adAccountExternalId: accountPath,
        requestId: input.requestId,
        step: 'adset',
      });

      const adSet = await this.graphApi.post<{ id: string }>(
        `${accountPath}/adsets`,
        input.accessToken,
        adSetPayload,
      );

      ids.adSetId = this.assertMetaId(adSet, 'adsets');
      await input.onStepCreated('adset', ids);
    }

    // AdSet existe, tentar criar creative se não existe
    if (!ids.creativeId) {
      const imageHash = await this.metaImageUpload.uploadImageFromUrl(
        input.accessToken,
        accountPath,
        input.dto.imageUrl,
        {
          requestId: input.requestId,
          executionId: input.executionId,
          storeId: input.storeId,
          adAccountExternalId: accountPath,
        },
      );
      const creativePayload = buildMetaCreativePayload({
        campaignName: input.dto.name,
        pageId: input.pageId,
        destinationUrl: input.destinationUrl,
        message: input.dto.message,
        headline: input.dto.headline,
        description: input.dto.description,
        imageUrl: input.dto.imageUrl,
        imageHash,
        cta: input.dto.cta,
      });

      this.logCreativePayload('META_GRAPH_API_RESUME_REQUEST', `${accountPath}/adcreatives`, creativePayload, {
        requestId: input.requestId,
        executionId: input.executionId,
        storeId: input.storeId,
        adAccountExternalId: accountPath,
        step: 'creative',
      });

      const creative = await this.graphApi.post<{ id: string }>(
        `${accountPath}/adcreatives`,
        input.accessToken,
        creativePayload,
      );

      ids.creativeId = this.assertMetaId(creative, 'adcreatives');
      await input.onStepCreated('creative', ids);
    }

    // Creative existe, tentar criar ad se não existe
    if (!ids.adId) {
      const adPayload = {
        name: `${input.dto.name.trim()} - Ad`,
        adset_id: ids.adSetId,
        creative: JSON.stringify({ creative_id: ids.creativeId }),
        status: desiredStatus,
      };
      this.assertAdPayload(adPayload);
      this.logStepPayload('META_GRAPH_API_RESUME_REQUEST', `${accountPath}/ads`, 'ad', adPayload, {
        executionId: input.executionId,
        storeId: input.storeId,
        adAccountExternalId: accountPath,
        requestId: input.requestId,
      });

      const ad = await this.graphApi.post<{ id: string }>(
        `${accountPath}/ads`,
        input.accessToken,
        adPayload,
      );

      ids.adId = this.assertMetaId(ad, 'ads');
      await input.onStepCreated('ad', ids);
    }

    // Tudo criado! Retornar IDs completos
    return ids as Required<MetaCampaignResourceIds>;
  }

  private toMetaMoneyAmount(value: number): number {
    return Math.round(Number(value) * 100);
  }

  private buildCampaignPayload(
    dto: CreateMetaCampaignDto,
    objective: string,
    desiredStatus: 'ACTIVE' | 'PAUSED',
  ): Record<string, string> {
    return {
      name: dto.name.trim(),
      objective: objective.trim().toUpperCase(),
      status: desiredStatus,
      special_ad_categories: JSON.stringify((dto.specialAdCategories || []).map((item) => item.trim().toUpperCase()).filter(Boolean)),
      is_adset_budget_sharing_enabled: 'false',
    };
  }

  private buildAdSetPayload(
    dto: CreateMetaCampaignDto,
    campaignId: string,
    geoLocations: ReturnType<typeof buildMetaGeoLocations>,
    desiredStatus: 'ACTIVE' | 'PAUSED',
  ): MetaAdSetPayload {
    const dailyBudgetCents = this.toMetaMoneyAmount(dto.dailyBudget);
    const sanitizedCampaignId = campaignId.trim();
    const startTime = dto.startTime?.trim() || '';
    const endTime = dto.endTime?.trim() || '';
    const deliveryConfig = this.resolveDeliveryConfig(dto);
    const targetingPayload = this.buildTargetingPayload(dto, geoLocations);
    const payload = this.compactMetaPayload({
      name: `${dto.name.trim()} - AdSet`,
      campaign_id: sanitizedCampaignId,
      daily_budget: dailyBudgetCents,
      billing_event: deliveryConfig.billingEvent,
      optimization_goal: deliveryConfig.optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(targetingPayload),
      ...(deliveryConfig.promotedObject ? { promoted_object: JSON.stringify(deliveryConfig.promotedObject) } : {}),
      start_time: startTime,
      end_time: endTime,
      status: desiredStatus,
    });

    this.assertAdSetPayload(payload);
    return payload;
  }

  private resolveDeliveryConfig(dto: CreateMetaCampaignDto): {
    billingEvent: string;
    optimizationGoal: string;
    promotedObject?: Record<string, string>;
  } {
    const objective = dto.objective.trim().toUpperCase();

    if (objective === 'OUTCOME_LEADS') {
      if (!dto.pixelId?.trim()) {
        throw new Error('pixelId é obrigatório para campanhas de leads na Meta.');
      }

      return {
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        promotedObject: {
          pixel_id: dto.pixelId.trim(),
          custom_event_type: this.normalizeConversionEvent(dto.conversionEvent),
        },
      };
    }

    if (objective === 'REACH') {
      return {
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'REACH',
      };
    }

    return {
      billingEvent: 'IMPRESSIONS',
      optimizationGoal: 'LINK_CLICKS',
    };
  }

  private buildTargetingPayload(
    dto: CreateMetaCampaignDto,
    geoLocations: ReturnType<typeof buildMetaGeoLocations>,
  ): Record<string, unknown> {
    const targeting: Record<string, unknown> = {
      geo_locations: geoLocations,
    };

    const placementPayload = this.buildPlacementPayload(dto.placements || []);
    return { ...targeting, ...placementPayload };
  }

  private buildPlacementPayload(placements: string[]): Record<string, unknown> {
    const normalized = Array.from(new Set(placements.map((item) => item.trim().toLowerCase()).filter(Boolean)));
    if (!normalized.length) {
      return {};
    }

    const publisherPlatforms = new Set<string>();
    const facebookPositions = new Set<string>();
    const instagramPositions = new Set<string>();
    const messengerPositions = new Set<string>();
    const audienceNetworkPositions = new Set<string>();

    for (const placement of normalized) {
      switch (placement) {
        case 'feed':
          publisherPlatforms.add('facebook');
          publisherPlatforms.add('instagram');
          facebookPositions.add('feed');
          instagramPositions.add('stream');
          break;
        case 'stories':
          publisherPlatforms.add('facebook');
          publisherPlatforms.add('instagram');
          facebookPositions.add('story');
          instagramPositions.add('story');
          break;
        case 'reels':
          publisherPlatforms.add('facebook');
          publisherPlatforms.add('instagram');
          facebookPositions.add('facebook_reels');
          instagramPositions.add('reels');
          break;
        case 'explore':
          publisherPlatforms.add('instagram');
          instagramPositions.add('explore');
          break;
        case 'messenger':
          publisherPlatforms.add('messenger');
          messengerPositions.add('messenger_home');
          break;
        case 'audience_network':
          publisherPlatforms.add('audience_network');
          audienceNetworkPositions.add('classic');
          break;
        default:
          break;
      }
    }

    const payload: Record<string, unknown> = {};
    if (publisherPlatforms.size) payload['publisher_platforms'] = Array.from(publisherPlatforms);
    if (facebookPositions.size) payload['facebook_positions'] = Array.from(facebookPositions);
    if (instagramPositions.size) payload['instagram_positions'] = Array.from(instagramPositions);
    if (messengerPositions.size) payload['messenger_positions'] = Array.from(messengerPositions);
    if (audienceNetworkPositions.size) payload['audience_network_positions'] = Array.from(audienceNetworkPositions);
    return payload;
  }

  private normalizeConversionEvent(value?: string): string {
    const normalized = (value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    if (!normalized) {
      return 'LEAD';
    }

    const aliases: Record<string, string> = {
      PURCHASE: 'PURCHASE',
      LEAD: 'LEAD',
      COMPLETE_REGISTRATION: 'COMPLETE_REGISTRATION',
      CONTACT: 'CONTACT',
      SUBMIT_APPLICATION: 'SUBMIT_APPLICATION',
      START_TRIAL: 'START_TRIAL',
      VIEW_CONTENT: 'VIEW_CONTENT',
      ADD_TO_CART: 'ADD_TO_CART',
      INITIATE_CHECKOUT: 'INITIATE_CHECKOUT',
      SCHEDULE: 'SCHEDULE',
    };

    return aliases[normalized] || 'LEAD';
  }

  private assertCampaignPayload(payload: Record<string, string>): void {
    if (!payload.name?.trim()) {
      throw new Error('name é obrigatório para criar campaign na Meta.');
    }

    if (!payload.objective?.trim()) {
      throw new Error('objective é obrigatório para criar campaign na Meta.');
    }
  }

  private assertAdSetPayload(payload: Record<string, string | number>): void {
    if (!payload.campaign_id || !String(payload.campaign_id).trim()) {
      throw new Error('campaign_id é obrigatório para criar adset na Meta.');
    }

    if (!Number.isInteger(Number(payload.daily_budget)) || Number(payload.daily_budget) <= 0) {
      throw new Error('Orçamento diário inválido para Meta.');
    }

    if (!payload.start_time || !String(payload.start_time).trim()) {
      throw new Error('start_time é obrigatório para criar adset na Meta.');
    }

    if (!payload.end_time || !String(payload.end_time).trim()) {
      throw new Error('end_time é obrigatório para criar adset na Meta.');
    }

    if (!payload.targeting || !String(payload.targeting).trim()) {
      throw new Error('targeting mínimo é obrigatório para criar adset na Meta.');
    }

    const targeting = JSON.parse(String(payload.targeting)) as Record<string, unknown>;
    const geoLocations = (targeting['geo_locations'] ?? {}) as Record<string, unknown>;
    const countries = Array.isArray(geoLocations['countries']) ? geoLocations['countries'] : [];
    if (!countries.length || countries.some((entry) => typeof entry !== 'string' || !entry.trim())) {
      throw new Error('country é obrigatório para criar adset na Meta.');
    }

    if ('cities' in geoLocations) {
      throw new Error('Cidade da Meta ainda não está mapeada com segurança. Use somente país ou região válida.');
    }

    if ('promoted_object' in payload) {
      const promotedObject = JSON.parse(String(payload.promoted_object)) as Record<string, unknown>;
      const nullIntegerField = ['pixel_id', 'custom_event_type'].find((field) => promotedObject[field] == null);
      if (nullIntegerField) {
        throw new Error(`promoted_object inválido: ${nullIntegerField} não pode ser nulo.`);
      }
    }
  }

  private assertAdPayload(payload: Record<string, string>): void {
    if (!payload.name?.trim()) {
      throw new Error('name é obrigatório para criar ad na Meta.');
    }

    if (!payload.adset_id?.trim()) {
      throw new Error('adset_id é obrigatório para criar ad na Meta.');
    }
  }

  private logAdSetPayload(
    event: string,
    endpoint: string,
    payload: Record<string, string | number>,
    location: ReturnType<typeof normalizeCampaignLocation>,
    context: Record<string, unknown>,
  ): void {
    const targeting = typeof payload.targeting === 'string' ? JSON.parse(payload.targeting) : payload.targeting;

    this.logger.log(
      JSON.stringify({
        event,
        endpoint,
        ...context,
        audienceLocationTrace: {
          country: location.country,
          state: location.state,
          stateName: location.stateName,
          city: location.city,
          cityId: location.cityId,
          geoLocations: targeting?.geo_locations ?? null,
        },
        payload,
      }),
    );

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        JSON.stringify({
          event: 'META_ADSET_PAYLOAD_DEBUG',
          endpoint,
          ...context,
          campaign_id: payload.campaign_id ?? null,
          daily_budget: payload.daily_budget ?? null,
          billing_event: payload.billing_event ?? null,
          optimization_goal: payload.optimization_goal ?? null,
          bid_strategy: payload.bid_strategy ?? null,
          targeting: targeting ?? null,
          promoted_object: payload.promoted_object ? JSON.parse(String(payload.promoted_object)) : null,
          start_time: payload.start_time ?? null,
          end_time: payload.end_time ?? null,
          normalizedLocation: {
            country: location.country,
            state: location.state,
            stateName: location.stateName,
            city: location.city,
            cityId: location.cityId,
            metaCityKey: location.metaCityKey,
          },
        }),
      );
    }
  }

  private compactMetaPayload<T extends Record<string, string | number | undefined | null>>(payload: T): MetaAdSetPayload {
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ) as MetaAdSetPayload;
  }

  private logCreativePayload(
    event: string,
    endpoint: string,
    payload: Record<string, string>,
    context: Record<string, unknown>,
  ): void {
    const objectStorySpec = payload.object_story_spec ? JSON.parse(payload.object_story_spec) : null;

    this.logger.log(
      JSON.stringify({
        event,
        endpoint,
        ...context,
        creativeTrace: objectStorySpec
          ? {
              pageId: objectStorySpec.page_id ?? null,
              creativeType: 'LINK_AD',
              link: objectStorySpec.link_data?.link ?? null,
              headline: objectStorySpec.link_data?.name ?? null,
              hasDescription: typeof objectStorySpec.link_data?.description === 'string',
              ctaType: objectStorySpec.link_data?.call_to_action?.type ?? null,
              imageSource: objectStorySpec.link_data?.image_hash ? 'image_hash' : objectStorySpec.link_data?.image_url ? 'image_url' : null,
              imageHash: objectStorySpec.link_data?.image_hash ?? null,
              imageUrl: objectStorySpec.link_data?.image_url ?? null,
            }
          : null,
        payload,
      }),
    );
  }

  private logStepPayload(
    event: string,
    endpoint: string,
    step: MetaCampaignOrchestratorStep,
    payload: Record<string, string | number>,
    context: Record<string, unknown>,
  ): void {
    this.logger.log(
      JSON.stringify({
        event,
        endpoint,
        step,
        ...context,
        payload,
      }),
    );
  }
}
