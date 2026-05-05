import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetaCampaignCreationMetaErrorDetails1776860000000 implements MigrationInterface {
  name = 'AddMetaCampaignCreationMetaErrorDetails1776860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD COLUMN IF NOT EXISTS "metaErrorDetails" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP COLUMN IF EXISTS "metaErrorDetails"
    `);
  }
}
