import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntroduceTenants1776570000000 implements MigrationInterface {
  name = 'IntroduceTenants1776570000000';

  private readonly platformTenantId = '00000000-0000-4000-8000-000000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenants" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "tenants" ("id", "name", "createdAt", "updatedAt")
      VALUES ($1, 'MetaIQ Platform', now(), now())
      ON CONFLICT ("id") DO NOTHING
    `, [this.platformTenantId]);

    await queryRunner.query(`
      INSERT INTO "tenants" ("id", "name", "createdAt", "updatedAt")
      SELECT "id", "name", COALESCE("createdAt", now()), COALESCE("updatedAt", now())
      FROM "managers"
      ON CONFLICT ("id") DO NOTHING
    `);

    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenantId" uuid`);
    await queryRunner.query(`ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "tenantId" uuid`);

    await queryRunner.query(`
      UPDATE "users"
      SET "tenantId" = COALESCE("managerId", $1)
      WHERE "tenantId" IS NULL
    `, [this.platformTenantId]);

    await queryRunner.query(`
      UPDATE "stores"
      SET "tenantId" = "managerId"
      WHERE "tenantId" IS NULL
    `);

    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "stores" ALTER COLUMN "tenantId" SET NOT NULL`);

    await this.addConstraintIfMissing(
      queryRunner,
      'FK_users_tenantId',
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_tenantId" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'FK_stores_tenantId',
      `ALTER TABLE "stores" ADD CONSTRAINT "FK_stores_tenantId" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_tenantId" ON "users" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_stores_tenantId" ON "stores" ("tenantId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stores_tenantId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_tenantId"`);
    await queryRunner.query(`ALTER TABLE "stores" DROP CONSTRAINT IF EXISTS "FK_stores_tenantId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_tenantId"`);
    await queryRunner.query(`ALTER TABLE "stores" DROP COLUMN IF EXISTS "tenantId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "tenantId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }

  private async addConstraintIfMissing(
    queryRunner: QueryRunner,
    name: string,
    sql: string,
  ): Promise<void> {
    const exists = await queryRunner.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [name]);
    if (!exists.length) {
      await queryRunner.query(sql);
    }
  }
}
