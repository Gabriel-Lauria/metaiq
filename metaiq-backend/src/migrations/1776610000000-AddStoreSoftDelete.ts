import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreSoftDelete1776610000000 implements MigrationInterface {
  name = 'AddStoreSoftDelete1776610000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_stores_deletedAt" ON "stores" ("deletedAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stores_deletedAt"`);
    await queryRunner.query(`ALTER TABLE "stores" DROP COLUMN IF EXISTS "deletedAt"`);
  }
}
