import { Injectable } from '@nestjs/common';
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
    const accountPath = input.adAccountExternalId;

    const campaign = await this.graphApi.post<{ id: string }>(
      `${accountPath}/campaigns`,
      input.accessToken,
      {
        name: input.dto.name,
        objective: input.objective,
        status: 'PAUSED',
        special_ad_categories: JSON.stringify([]),
      },
    );
    ids.campaignId = this.assertMetaId(campaign, 'campaigns');
    await input.onStepCreated('campaign', ids);

    const adSet = await this.graphApi.post<{ id: string }>(
      `${accountPath}/adsets`,
      input.accessToken,
      {
        name: `${input.dto.name} - AdSet`,
        campaign_id: ids.campaignId,
        daily_budget: Math.round(Number(input.dto.dailyBudget) * 100),
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        targeting: JSON.stringify({
          geo_locations: {
            countries: [input.dto.country.trim().toUpperCase()],
          },
        }),
        status: 'PAUSED',
      },
    );
    ids.adSetId = this.assertMetaId(adSet, 'adsets');
    await input.onStepCreated('adset', ids);

    const creative = await this.graphApi.post<{ id: string }>(
      `${accountPath}/adcreatives`,
      input.accessToken,
      {
        name: `${input.dto.name} - Creative`,
        object_story_spec: JSON.stringify({
          page_id: input.pageId,
          link_data: {
            link: input.destinationUrl,
            message: input.dto.message,
            image_url: input.dto.imageUrl,
            call_to_action: {
              type: 'LEARN_MORE',
              value: {
                link: input.destinationUrl,
              },
            },
          },
        }),
      },
    );
    ids.creativeId = this.assertMetaId(creative, 'adcreatives');
    await input.onStepCreated('creative', ids);

    const ad = await this.graphApi.post<{ id: string }>(
      `${accountPath}/ads`,
      input.accessToken,
      {
        name: `${input.dto.name} - Ad`,
        adset_id: ids.adSetId,
        creative: JSON.stringify({ creative_id: ids.creativeId }),
        status: 'PAUSED',
      },
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
