import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantBusinessProfile1776810000000 implements MigrationInterface {
  name = 'AddTenantBusinessProfile1776810000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "businessName" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "businessSegment" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "defaultCity" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "defaultState" character varying
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "defaultState"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "defaultCity"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "businessSegment"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "businessName"`);
  }
}
