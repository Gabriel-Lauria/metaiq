import * as fs from 'fs';
import * as path from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import { AdAccount } from '../../modules/ad-accounts/ad-account.entity';
import { Campaign } from '../../modules/campaigns/campaign.entity';
import { OAuthState } from '../../modules/integrations/oauth-state.entity';
import { MetaCampaignCreation } from '../../modules/integrations/meta/meta-campaign-creation.entity';
import { StoreIntegration } from '../../modules/integrations/store-integration.entity';
import { Insight } from '../../modules/insights/insight.entity';
import { MetricDaily } from '../../modules/metrics/metric-daily.entity';
import { Store } from '../../modules/stores/store.entity';
import { UserStore } from '../../modules/user-stores/user-store.entity';

function findColumn(target: Function, propertyName: string) {
  const column = getMetadataArgsStorage().columns.find(
    (entry) => entry.target === target && entry.propertyName === propertyName,
  );

  expect(column).toBeDefined();
  return column!;
}

function expectNotNullable(target: Function, propertyNames: string[]): void {
  for (const propertyName of propertyNames) {
    expect(findColumn(target, propertyName).options.nullable).not.toBe(true);
  }
}

function expectNullable(target: Function, propertyNames: string[]): void {
  for (const propertyName of propertyNames) {
    expect(findColumn(target, propertyName).options.nullable).toBe(true);
  }
}

function findRelation(target: Function, propertyName: string) {
  const relation = getMetadataArgsStorage().relations.find(
    (entry) => entry.target === target && entry.propertyName === propertyName,
  );

  expect(relation).toBeDefined();
  return relation!;
}

function getIndexColumns(entry: { columns?: string[] | ((object?: any) => any[] | { [key: string]: number }) }): string[] {
  return Array.isArray(entry.columns) ? entry.columns : [];
}

describe('Schema integrity audit', () => {
  const migrationsDir = path.resolve(__dirname, '..');
  const migrationSql = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf-8'))
    .join('\n');

  it('keeps the critical PostgreSQL foreign keys and indexes in migrations', () => {
    const requiredSnippets = [
      'FK_users_tenantId',
      'FK_stores_tenantId',
      'FK_store_integrations_storeId',
      'FK_oauth_states_storeId',
      'FK_oauth_states_initiatedByUserId',
      'FK_meta_campaign_creations_store',
      'FK_meta_campaign_creations_campaign',
      'FK_campaigns_adAccount_store_chain',
      'FK_meta_campaign_creations_adAccount_store_chain',
      'UQ_ad_accounts_id_storeId',
      'IDX_campaigns_storeId_adAccountId',
      'IDX_meta_campaign_creations_storeId_adAccountId',
      'IDX_metrics_daily_campaignId_date_unique',
      'ALTER COLUMN "tenantId" SET NOT NULL',
      'ALTER COLUMN "storeId" SET NOT NULL',
      'ALTER COLUMN "accountType" SET NOT NULL',
    ];

    for (const snippet of requiredSnippets) {
      expect(migrationSql).toContain(snippet);
    }
  });

  it('keeps mandatory domain columns non-nullable and only known exceptions nullable', () => {
    expectNotNullable(Store, ['name', 'managerId', 'tenantId']);
    expectNullable(Store, ['createdByUserId', 'deletedAt']);

    expectNotNullable(AdAccount, ['metaId', 'provider', 'syncStatus', 'name', 'userId', 'storeId']);
    expectNullable(AdAccount, ['externalId', 'importedAt', 'lastSeenAt', 'currency', 'accessToken', 'tokenExpiresAt']);

    expectNotNullable(Campaign, ['metaId', 'name', 'status', 'score', 'userId', 'storeId', 'adAccountId']);
    expectNullable(Campaign, ['externalId', 'objective', 'dailyBudget', 'startTime', 'endTime', 'lastSeenAt', 'createdByUserId']);

    expectNotNullable(MetricDaily, [
      'campaignId',
      'date',
      'impressions',
      'clicks',
      'spend',
      'conversions',
      'revenue',
      'ctr',
      'cpa',
      'roas',
    ]);

    expectNotNullable(Insight, [
      'campaignId',
      'type',
      'severity',
      'message',
      'recommendation',
      'resolved',
      'priority',
      'cooldownInHours',
      'ruleVersion',
    ]);
    expectNullable(Insight, ['lastTriggeredAt']);

    expectNotNullable(StoreIntegration, ['storeId', 'provider', 'status', 'lastSyncStatus']);

    expectNotNullable(UserStore, ['userId', 'storeId']);

    expectNotNullable(OAuthState, ['provider', 'state', 'storeId', 'initiatedByUserId', 'expiresAt']);
    expectNullable(OAuthState, ['usedAt']);

    expectNotNullable(MetaCampaignCreation, [
      'storeId',
      'requesterUserId',
      'adAccountId',
      'idempotencyKey',
      'status',
      'campaignCreated',
      'adSetCreated',
      'creativeCreated',
      'adCreated',
    ]);
    expectNullable(MetaCampaignCreation, [
      'campaignId',
      'metaCampaignId',
      'metaAdSetId',
      'metaCreativeId',
      'metaAdId',
      'errorStep',
      'errorMessage',
      'requestPayload',
      'payloadHash',
    ]);
  });

  it('keeps anti-orphan relationships and critical indexes wired in metadata', () => {
    expect(findRelation(StoreIntegration, 'store').options.onDelete).toBe('CASCADE');
    expect(findRelation(UserStore, 'user').options.onDelete).toBe('CASCADE');
    expect(findRelation(UserStore, 'store').options.onDelete).toBe('CASCADE');
    expect(findRelation(OAuthState, 'store').options.onDelete).toBe('CASCADE');
    expect(findRelation(OAuthState, 'initiatedByUser').options.onDelete).toBe('CASCADE');
    expect(findRelation(Campaign, 'createdBy').options.onDelete).toBe('SET NULL');
    expect(findRelation(Campaign, 'adAccount').options.onDelete).toBe('NO ACTION');
    expect(findRelation(MetricDaily, 'campaign').options.onDelete).toBe('NO ACTION');
    expect(findRelation(Insight, 'campaign').options.onDelete).toBe('NO ACTION');
    expect(findRelation(MetaCampaignCreation, 'store').options.onDelete).toBe('CASCADE');

    const indices = getMetadataArgsStorage().indices;
    const uniques = getMetadataArgsStorage().uniques;

    expect(indices.some((entry) => entry.target === Campaign && getIndexColumns(entry).join(',') === 'storeId,adAccountId')).toBe(true);
    expect(indices.some((entry) => entry.target === MetricDaily && entry.name === 'IDX_metrics_daily_campaignId_date_unique')).toBe(true);
    expect(indices.some((entry) => entry.target === MetaCampaignCreation && getIndexColumns(entry).join(',') === 'storeId,adAccountId')).toBe(true);
    expect(indices.some((entry) => entry.target === OAuthState && getIndexColumns(entry).join(',') === 'provider,state')).toBe(true);
    expect(uniques.some((entry) => entry.target === AdAccount && entry.name === 'UQ_ad_accounts_id_storeId')).toBe(true);
    expect(
      uniques.some(
        (entry) => entry.target === MetaCampaignCreation && entry.name === 'UQ_meta_campaign_creations_store_idempotency',
      ),
    ).toBe(true);
  });
});
