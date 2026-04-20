import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullableImportedCampaignFields1776620000000 implements MigrationInterface {
  name = 'AllowNullableImportedCampaignFields1776620000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "campaigns" ALTER COLUMN "objective" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "campaigns" ALTER COLUMN "objective" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "campaigns" ALTER COLUMN "dailyBudget" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "campaigns" ALTER COLUMN "startTime" DROP NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`UPDATE "campaigns" SET "objective" = 'CONVERSIONS' WHERE "objective" IS NULL`);
    await queryRunner.query(`UPDATE "campaigns" SET "dailyBudget" = 0 WHERE "dailyBudget" IS NULL`);
    await queryRunner.query(`UPDATE "campaigns" SET "startTime" = NOW() WHERE "startTime" IS NULL`);
    await queryRunner.query(`ALTER TABLE "campaigns" ALTER COLUMN "objective" SET DEFAULT 'CONVERSIONS'`);
    await queryRunner.query(`ALTER TABLE "campaigns" ALTER COLUMN "objective" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "campaigns" ALTER COLUMN "dailyBudget" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "campaigns" ALTER COLUMN "startTime" SET NOT NULL`);
  }
}
