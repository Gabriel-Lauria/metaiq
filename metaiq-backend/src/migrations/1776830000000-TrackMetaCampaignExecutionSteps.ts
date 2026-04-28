import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrackMetaCampaignExecutionSteps1776830000000 implements MigrationInterface {
  name = 'TrackMetaCampaignExecutionSteps1776830000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD COLUMN IF NOT EXISTS "currentStep" character varying(32)
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD COLUMN IF NOT EXISTS "stepState" text
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD COLUMN IF NOT EXISTS "retryCount" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD COLUMN IF NOT EXISTS "lastRetryAt" timestamp
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD COLUMN IF NOT EXISTS "canRetry" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      ADD COLUMN IF NOT EXISTS "userMessage" text
    `);

    await queryRunner.query(`
      UPDATE "meta_campaign_creations"
      SET
        "currentStep" = COALESCE("errorStep", CASE
          WHEN "status" = 'IN_PROGRESS' THEN 'campaign'
          ELSE NULL
        END),
        "canRetry" = CASE
          WHEN COALESCE("metaCampaignId", "metaAdSetId", "metaCreativeId", "metaAdId") IS NOT NULL
            AND "status" IN ('PARTIAL', 'FAILED')
          THEN true
          ELSE false
        END,
        "userMessage" = CASE
          WHEN "status" = 'PARTIAL' THEN 'Parte da campanha foi criada na Meta. Use o recovery seguro para continuar sem duplicar recursos.'
          WHEN "status" = 'FAILED' AND COALESCE("metaCampaignId", "metaAdSetId", "metaCreativeId", "metaAdId") IS NOT NULL
            THEN 'A execução falhou depois de criar recursos na Meta. Reconcilie ou retome esta execução antes de tentar novamente.'
          WHEN "status" = 'IN_PROGRESS' THEN 'A execução da campanha ainda está em andamento.'
          WHEN "status" = 'COMPLETED' THEN 'A execução da campanha foi concluída com sucesso.'
          ELSE NULL
        END
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP COLUMN IF EXISTS "userMessage"
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP COLUMN IF EXISTS "canRetry"
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP COLUMN IF EXISTS "lastRetryAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP COLUMN IF EXISTS "retryCount"
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP COLUMN IF EXISTS "stepState"
    `);
    await queryRunner.query(`
      ALTER TABLE "meta_campaign_creations"
      DROP COLUMN IF EXISTS "currentStep"
    `);
  }
}
