import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSessionVersion1776690000000 implements MigrationInterface {
  name = 'AddUserSessionVersion1776690000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "sessionVersion" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_sessionVersion"
      ON "users" ("sessionVersion")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_sessionVersion"`);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "sessionVersion"
    `);
  }
}
