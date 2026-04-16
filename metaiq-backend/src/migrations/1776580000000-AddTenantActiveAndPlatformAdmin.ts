import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantActiveAndPlatformAdmin1776580000000 implements MigrationInterface {
  name = 'AddTenantActiveAndPlatformAdmin1776580000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "tenantId" DROP NOT NULL`);
    await queryRunner.query(`
      UPDATE "users"
      SET "role" = 'PLATFORM_ADMIN',
          "tenantId" = NULL
      WHERE "role" = 'ADMIN'
        AND "managerId" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      UPDATE "users"
      SET "role" = 'ADMIN',
          "tenantId" = '00000000-0000-4000-8000-000000000001'
      WHERE "role" = 'PLATFORM_ADMIN'
    `);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "active"`);
  }
}
