import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantCompanyChannels1776820000000 implements MigrationInterface {
  name = 'AddTenantCompanyChannels1776820000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "website" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "instagram" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "whatsapp" character varying
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "whatsapp"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "instagram"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "website"`);
  }
}
