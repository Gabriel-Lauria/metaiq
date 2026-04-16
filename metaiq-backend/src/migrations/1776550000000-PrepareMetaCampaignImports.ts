import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrepareMetaCampaignImports1776550000000 implements MigrationInterface {
  name = 'PrepareMetaCampaignImports1776550000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "externalId" character varying`);
    await queryRunner.query(`ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_externalId" ON "campaigns" ("externalId")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_campaigns_store_externalId"
      ON "campaigns" ("storeId", "externalId")
      WHERE "externalId" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_campaigns_store_externalId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_campaigns_externalId"`);
    await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "lastSeenAt"`);
    await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "externalId"`);
  }
}
