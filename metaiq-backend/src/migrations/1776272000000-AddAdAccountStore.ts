import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdAccountStore1776272000000 implements MigrationInterface {
  name = 'AddAdAccountStore1776272000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('ad_accounts', 'storeId'))) {
      const type = queryRunner.connection.options.type === 'postgres' ? 'uuid' : 'varchar';
      await queryRunner.query(`ALTER TABLE "ad_accounts" ADD COLUMN "storeId" ${type}`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ad_accounts_storeId" ON "ad_accounts" ("storeId")`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('ad_accounts', 'storeId')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ad_accounts_storeId"`);
      await queryRunner.query(`ALTER TABLE "ad_accounts" DROP COLUMN "storeId"`);
    }
  }
}
