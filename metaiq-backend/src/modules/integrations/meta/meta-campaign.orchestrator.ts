import { Injectable, Logger } from '@nestjs/common';
import { CreateMetaCampaignDto } from './dto/meta-integration.dto';
import { MetaGraphApiClient } from './meta-graph-api.client';

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

  constructor(private readonly graphApi: MetaGraphApiClient) {}

  async createResources(input: {
    adAccountExternalId: string;
    accessToken: string;
    dto: CreateMetaCampaignDto;
    pageId: string;
    destinationUrl: string;
    objective: string;
    onStepCreated: (step: MetaCampaignOrchestratorStep, ids: MetaCampaignResourceIds) => Promise<void>;
  }): Promise<Required<MetaCampaignResourceIds>> {
    const ids: MetaCampaignResourceIds = {};
    const accountPath = input.adAccountExternalId.trim();

    const campaignPayload = {
      name: input.dto.name.trim(),
      objective: input.objective.trim().toUpperCase(),
      status: 'PAUSED',
      special_ad_categories: '[]',
      is_adset_budget_sharing_enabled: 'false',
    };

    this.logger.log(
      JSON.stringify({
        event: 'META_GRAPH_API_REQUEST',
        endpoint: `${accountPath}/campaigns`,
        payload: campaignPayload,
      }),
    );

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
      daily_budget: Math.round(Number(input.dto.dailyBudget)),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify({
        geo_locations: {
          countries: [input.dto.country.trim().toUpperCase()],
        },
      }),
      status: 'PAUSED',
    };

    this.logger.log(
      JSON.stringify({
        event: 'META_GRAPH_API_REQUEST',
        endpoint: `${accountPath}/adsets`,
        payload: adSetPayload,
      }),
    );

    const adSet = await this.graphApi.post<{ id: string }>(
      `${accountPath}/adsets`,
      input.accessToken,
      adSetPayload,
    );

    ids.adSetId = this.assertMetaId(adSet, 'adsets');
    await input.onStepCreated('adset', ids);

    const creativePayload = {
      name: `${input.dto.name.trim()} - Creative`,
      object_story_spec: JSON.stringify({
        page_id: input.pageId.trim(),
        link_data: {
          link: input.destinationUrl.trim(),
          message: input.dto.message.trim(),
          call_to_action: {
            type: 'LEARN_MORE',
            value: {
              link: input.destinationUrl.trim(),
            },
          },
        },
      }),
    };

    this.logger.log(
      JSON.stringify({
        event: 'META_GRAPH_API_REQUEST',
        endpoint: `${accountPath}/adcreatives`,
        payload: creativePayload,
      }),
    );

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
      status: 'PAUSED',
    };

    this.logger.log(
      JSON.stringify({
        event: 'META_GRAPH_API_REQUEST',
        endpoint: `${accountPath}/ads`,
        payload: adPayload,
      }),
    );

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
}