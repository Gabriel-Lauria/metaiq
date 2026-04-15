import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCampaignStore1776273000000 implements MigrationInterface {
  name = 'AddCampaignStore1776273000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type === 'postgres' ? 'uuid' : 'varchar';

    if (!(await queryRunner.hasColumn('campaigns', 'storeId'))) {
      await queryRunner.query(`ALTER TABLE "campaigns" ADD COLUMN "storeId" ${type}`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_storeId" ON "campaigns" ("storeId")`);
    }

    if (!(await queryRunner.hasColumn('campaigns', 'createdByUserId'))) {
      await queryRunner.query(`ALTER TABLE "campaigns" ADD COLUMN "createdByUserId" ${type}`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('campaigns', 'createdByUserId')) {
      await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "createdByUserId"`);
    }

    if (await queryRunner.hasColumn('campaigns', 'storeId')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_campaigns_storeId"`);
      await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "storeId"`);
    }
  }
}
