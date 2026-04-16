import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdAccountExternalUnique1776540000000 implements MigrationInterface {
  name = 'AddAdAccountExternalUnique1776540000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ad_accounts_store_provider_externalId"
      ON "ad_accounts" ("storeId", "provider", "externalId")
      WHERE "externalId" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ad_accounts_store_provider_externalId"`);
  }
}
