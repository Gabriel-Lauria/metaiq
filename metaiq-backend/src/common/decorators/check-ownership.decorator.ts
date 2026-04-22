import { SetMetadata } from '@nestjs/common';

export type OwnershipResource = 'campaign' | 'adAccount' | 'insight' | 'metricCampaign';

export interface OwnershipMetadata {
  resource: OwnershipResource;
  paramName: string;
}

export const CHECK_OWNERSHIP_KEY = 'checkOwnership';

export const CheckOwnership = (
  resource: OwnershipResource,
  paramName = 'id',
) => SetMetadata(CHECK_OWNERSHIP_KEY, { resource, paramName } satisfies OwnershipMetadata);
