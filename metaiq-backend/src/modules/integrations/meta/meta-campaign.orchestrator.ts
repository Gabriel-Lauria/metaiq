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

    const campaignPayload = {
      name: input.dto.name.trim(),
      objective: input.objective.trim().toUpperCase(),
      status: desiredStatus,
      special_ad_categories: '[]',
      is_adset_budget_sharing_enabled: 'false',
    };
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

    const adSetPayload = {
      name: `${input.dto.name.trim()} - AdSet`,
      campaign_id: ids.campaignId,
      daily_budget: this.toMetaMoneyAmount(input.dto.dailyBudget),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify({
        geo_locations: geoLocations,
      }),
      status: desiredStatus,
    };
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
      const adSetPayload = {
        name: `${input.dto.name.trim()} - AdSet`,
        campaign_id: ids.campaignId,
        daily_budget: this.toMetaMoneyAmount(input.dto.dailyBudget),
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: JSON.stringify({
          geo_locations: geoLocations,
        }),
        status: desiredStatus,
      };
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

  private assertCampaignPayload(payload: Record<string, string>): void {
    if (!payload.name?.trim()) {
      throw new Error('name é obrigatório para criar campaign na Meta.');
    }

    if (!payload.objective?.trim()) {
      throw new Error('objective é obrigatório para criar campaign na Meta.');
    }
  }

  private assertAdSetPayload(payload: Record<string, string | number>): void {
    if (!payload.campaign_id) {
      throw new Error('campaign_id é obrigatório para criar adset na Meta.');
    }

    if (!Number.isFinite(Number(payload.daily_budget)) || Number(payload.daily_budget) <= 0) {
      throw new Error('daily_budget inválido para criar adset na Meta.');
    }

    if (!payload.targeting) {
      throw new Error('targeting mínimo é obrigatório para criar adset na Meta.');
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
