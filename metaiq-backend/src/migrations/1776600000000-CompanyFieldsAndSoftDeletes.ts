import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyFieldsAndSoftDeletes1776600000000 implements MigrationInterface {
  name = 'CompanyFieldsAndSoftDeletes1776600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    for (const table of ['tenants', 'managers']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "cnpj" character varying`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "phone" character varying`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "email" character varying`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "contactName" character varying`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "notes" text`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_${table}_deletedAt" ON "${table}" ("deletedAt")`);
    }

    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_deletedAt" ON "users" ("deletedAt")`);

    await queryRunner.query(`
      UPDATE "tenants" t
      SET
        "cnpj" = COALESCE(t."cnpj", m."cnpj"),
        "phone" = COALESCE(t."phone", m."phone"),
        "email" = COALESCE(t."email", m."email"),
        "contactName" = COALESCE(t."contactName", m."contactName"),
        "notes" = COALESCE(t."notes", m."notes"),
        "deletedAt" = COALESCE(t."deletedAt", m."deletedAt")
      FROM "managers" m
      WHERE t."id" = m."id"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_deletedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deletedAt"`);

    for (const table of ['tenants', 'managers']) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${table}_deletedAt"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "deletedAt"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "notes"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "contactName"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "email"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "phone"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "cnpj"`);
    }
  }
}
