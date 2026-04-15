# Store Ownership Transition

## Current Ownership Model

`storeId` is the primary ownership field for new operational data:

- `AdAccount.storeId` defines the store that owns the ad account.
- `Campaign.storeId` defines the store that owns the campaign.
- `Campaign.createdByUserId` is audit data only.
- `Campaign.userId` and `AdAccount.userId` remain as legacy compatibility fields.

## New Writes

New `AdAccount` and `Campaign` writes must include `storeId`.

The backend validates `storeId` with `AccessScopeService.validateStoreAccess`, so a payload-provided store is never trusted by itself.

When a campaign is created or updated, its `adAccountId` must belong to the same `storeId`.

## Read Scope

The primary read path is:

`Campaign -> Store -> Manager/UserStore`

and

`AdAccount -> Store -> Manager/UserStore`

`AccessScopeService.applyCampaignScope` and `AccessScopeService.applyAdAccountScope` centralize the transitional fallback logic.

## Legacy Fallback

Legacy records with `storeId = null` may still be visible through controlled fallback:

- `ADMIN`: can read all.
- `MANAGER`: can read legacy records only when the legacy owner user's `managerId` matches the manager tenant.
- `OPERATIONAL` and `CLIENT`: can read legacy campaign-linked data only when the legacy `userId` is their own user.

When a request explicitly filters by `storeId`, legacy records are not included.

## Future Backfill

Before removing legacy ownership:

- Backfill `AdAccount.storeId`.
- Backfill `Campaign.storeId`.
- Validate `Campaign.adAccountId` and `Campaign.storeId` consistency.
- Add final foreign keys.
- Make `storeId` non-null.
- Remove or demote legacy `userId` fields after compatibility is no longer needed.
