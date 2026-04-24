import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenMetaCampaignCreationOperationalState1776670000000 implements MigrationInterface {
  name = 'HardenMetaCampaignCreationOperationalState1776670000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD COLUMN IF NOT EXISTS "payloadHash" character varying
    `);

    await queryRunner.query(`
      UPDATE "meta_campaign_creations"
      SET "status" = 'IN_PROGRESS'
      WHERE "status" = 'CREATING'
    `);

    await queryRunner.query(`
      UPDATE "meta_campaign_creations"
      SET "status" = 'COMPLETED'
      WHERE "status" = 'ACTIVE'
    `);

    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS'
    `);

    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP CONSTRAINT IF EXISTS "CHK_meta_campaign_creations_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD CONSTRAINT "CHK_meta_campaign_creations_status"
      CHECK ("status" IN ('PENDING', 'IN_PROGRESS', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED'))
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_meta_campaign_creations_payloadHash"
      ON "meta_campaign_creations" ("payloadHash")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_meta_campaign_creations_payloadHash"`);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP CONSTRAINT IF EXISTS "CHK_meta_campaign_creations_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ALTER COLUMN "status" SET DEFAULT 'CREATING'
    `);
    await queryRunner.query(`
      UPDATE "meta_campaign_creations"
      SET "status" = 'CREATING'
      WHERE "status" = 'IN_PROGRESS'
    `);
    await queryRunner.query(`
      UPDATE "meta_campaign_creations"
      SET "status" = 'ACTIVE'
      WHERE "status" = 'COMPLETED'
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP COLUMN IF EXISTS "payloadHash"
    `);
  }
}
