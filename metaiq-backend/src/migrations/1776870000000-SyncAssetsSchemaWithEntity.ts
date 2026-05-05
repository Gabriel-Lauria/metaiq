import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncAssetsSchemaWithEntity1776870000000 implements MigrationInterface {
  name = 'SyncAssetsSchemaWithEntity1776870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "adAccountId" uuid`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "originalName" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "fileName" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "metaRawImageId" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "metaRawResponse" text`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_assets_adAccountId" ON "assets" ("adAccountId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_assets_deletedAt" ON "assets" ("deletedAt")`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_assets_ad_account'
        ) THEN
          ALTER TABLE "assets"
          ADD CONSTRAINT "FK_assets_ad_account"
          FOREIGN KEY ("adAccountId") REFERENCES "ad_accounts"("id")
          ON DELETE SET NULL
          ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_assets_ad_account'
        ) THEN
          ALTER TABLE "assets" DROP CONSTRAINT "FK_assets_ad_account";
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assets_deletedAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_assets_adAccountId"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "archivedAt"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "metaRawResponse"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "metaRawImageId"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "fileName"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "originalName"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "adAccountId"`);
  }
}
