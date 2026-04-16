import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureStoreIntegrationsTable1776450000000 implements MigrationInterface {
  name = 'EnsureStoreIntegrationsTable1776450000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "store_integrations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "storeId" uuid NOT NULL,
        "provider" character varying(32) NOT NULL DEFAULT 'META',
        "status" character varying(32) NOT NULL DEFAULT 'NOT_CONNECTED',
        "externalBusinessId" character varying,
        "externalAdAccountId" character varying,
        "accessToken" character varying,
        "refreshToken" character varying,
        "tokenExpiresAt" TIMESTAMP,
        "lastSyncAt" TIMESTAMP,
        "lastSyncStatus" character varying(32) NOT NULL DEFAULT 'NEVER_SYNCED',
        "lastSyncError" text,
        "metadata" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_store_integrations" PRIMARY KEY ("id")
      )
    `);

    await this.addUniqueIfMissing(queryRunner);
    await this.addForeignKeyIfMissing(queryRunner);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_integrations_storeId" ON "store_integrations" ("storeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_integrations_provider" ON "store_integrations" ("provider")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_store_integrations_status" ON "store_integrations" ("status")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "store_integrations" DROP CONSTRAINT IF EXISTS "FK_store_integrations_storeId"`);
    await queryRunner.query(`ALTER TABLE "store_integrations" DROP CONSTRAINT IF EXISTS "UQ_store_integrations_store_provider"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_integrations_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_integrations_provider"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_store_integrations_storeId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "store_integrations"`);
  }

  private async addUniqueIfMissing(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`,
      ['UQ_store_integrations_store_provider'],
    );

    if (exists.length > 0) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "store_integrations"
      ADD CONSTRAINT "UQ_store_integrations_store_provider"
      UNIQUE ("storeId", "provider")
    `);
  }

  private async addForeignKeyIfMissing(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`,
      ['FK_store_integrations_storeId'],
    );

    if (exists.length > 0) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "store_integrations"
      ADD CONSTRAINT "FK_store_integrations_storeId"
      FOREIGN KEY ("storeId")
      REFERENCES "stores"("id")
      ON DELETE CASCADE
    `);
  }
}
