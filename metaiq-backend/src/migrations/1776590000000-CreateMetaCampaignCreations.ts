import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMetaCampaignCreations1776590000000 implements MigrationInterface {
  name = 'CreateMetaCampaignCreations1776590000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "meta_campaign_creations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "storeId" uuid NOT NULL,
        "requesterUserId" uuid NOT NULL,
        "adAccountId" uuid NOT NULL,
        "campaignId" uuid,
        "idempotencyKey" character varying NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'CREATING',
        "campaignCreated" boolean NOT NULL DEFAULT false,
        "adSetCreated" boolean NOT NULL DEFAULT false,
        "creativeCreated" boolean NOT NULL DEFAULT false,
        "adCreated" boolean NOT NULL DEFAULT false,
        "metaCampaignId" character varying,
        "metaAdSetId" character varying,
        "metaCreativeId" character varying,
        "metaAdId" character varying,
        "errorStep" character varying,
        "errorMessage" text,
        "requestPayload" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_meta_campaign_creations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_meta_campaign_creations_store_idempotency" UNIQUE ("storeId", "idempotencyKey"),
        CONSTRAINT "FK_meta_campaign_creations_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_meta_campaign_creations_requester" FOREIGN KEY ("requesterUserId") REFERENCES "users"("id"),
        CONSTRAINT "FK_meta_campaign_creations_ad_account" FOREIGN KEY ("adAccountId") REFERENCES "ad_accounts"("id"),
        CONSTRAINT "FK_meta_campaign_creations_campaign" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_meta_campaign_creations_storeId" ON "meta_campaign_creations" ("storeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_meta_campaign_creations_requesterUserId" ON "meta_campaign_creations" ("requesterUserId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_meta_campaign_creations_adAccountId" ON "meta_campaign_creations" ("adAccountId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_meta_campaign_creations_status" ON "meta_campaign_creations" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_meta_campaign_creations_metaCampaignId" ON "meta_campaign_creations" ("metaCampaignId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_meta_campaign_creations_metaCampaignId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_meta_campaign_creations_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_meta_campaign_creations_adAccountId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_meta_campaign_creations_requesterUserId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_meta_campaign_creations_storeId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "meta_campaign_creations"`);
  }
}
