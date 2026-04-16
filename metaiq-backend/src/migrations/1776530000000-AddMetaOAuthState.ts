import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetaOAuthState1776530000000 implements MigrationInterface {
  name = 'AddMetaOAuthState1776530000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "oauth_states" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" character varying(32) NOT NULL,
        "state" character varying(128) NOT NULL,
        "storeId" uuid NOT NULL,
        "initiatedByUserId" uuid NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "usedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oauth_states" PRIMARY KEY ("id")
      )
    `);
    await this.addConstraintIfMissing(
      queryRunner,
      'UQ_oauth_states_provider_state',
      `ALTER TABLE "oauth_states" ADD CONSTRAINT "UQ_oauth_states_provider_state" UNIQUE ("provider", "state")`,
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'FK_oauth_states_storeId',
      `ALTER TABLE "oauth_states" ADD CONSTRAINT "FK_oauth_states_storeId" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE`,
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'FK_oauth_states_initiatedByUserId',
      `ALTER TABLE "oauth_states" ADD CONSTRAINT "FK_oauth_states_initiatedByUserId" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_oauth_states_storeId" ON "oauth_states" ("storeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_oauth_states_initiatedByUserId" ON "oauth_states" ("initiatedByUserId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_oauth_states_expiresAt" ON "oauth_states" ("expiresAt")`);

    await queryRunner.query(`ALTER TABLE "store_integrations" ADD COLUMN IF NOT EXISTS "tokenType" character varying`);
    await queryRunner.query(`ALTER TABLE "store_integrations" ADD COLUMN IF NOT EXISTS "grantedScopes" text`);
    await queryRunner.query(`ALTER TABLE "store_integrations" ADD COLUMN IF NOT EXISTS "providerUserId" character varying`);
    await queryRunner.query(`ALTER TABLE "store_integrations" ADD COLUMN IF NOT EXISTS "oauthConnectedAt" TIMESTAMP`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "store_integrations" DROP COLUMN IF EXISTS "oauthConnectedAt"`);
    await queryRunner.query(`ALTER TABLE "store_integrations" DROP COLUMN IF EXISTS "providerUserId"`);
    await queryRunner.query(`ALTER TABLE "store_integrations" DROP COLUMN IF EXISTS "grantedScopes"`);
    await queryRunner.query(`ALTER TABLE "store_integrations" DROP COLUMN IF EXISTS "tokenType"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_oauth_states_expiresAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_oauth_states_initiatedByUserId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_oauth_states_storeId"`);
    await queryRunner.query(`ALTER TABLE "oauth_states" DROP CONSTRAINT IF EXISTS "FK_oauth_states_initiatedByUserId"`);
    await queryRunner.query(`ALTER TABLE "oauth_states" DROP CONSTRAINT IF EXISTS "FK_oauth_states_storeId"`);
    await queryRunner.query(`ALTER TABLE "oauth_states" DROP CONSTRAINT IF EXISTS "UQ_oauth_states_provider_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "oauth_states"`);
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
