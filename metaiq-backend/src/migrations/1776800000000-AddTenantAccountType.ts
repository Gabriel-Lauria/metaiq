import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantAccountType1776800000000 implements MigrationInterface {
  name = 'AddTenantAccountType1776800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'tenants_accounttype_enum'
        ) THEN
          CREATE TYPE "tenants_accounttype_enum" AS ENUM ('AGENCY', 'INDIVIDUAL');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "accountType" "tenants_accounttype_enum"
      DEFAULT 'AGENCY'
    `);

    await queryRunner.query(`
      UPDATE "tenants"
      SET "accountType" = 'AGENCY'
      WHERE "accountType" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ALTER COLUMN "accountType" SET DEFAULT 'AGENCY'
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants"
      ALTER COLUMN "accountType" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tenants_accountType"
      ON "tenants" ("accountType")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenants_accountType"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "accountType"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tenants_accounttype_enum"`);
  }
}
