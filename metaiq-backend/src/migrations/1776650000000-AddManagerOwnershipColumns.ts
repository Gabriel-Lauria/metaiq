import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManagerOwnershipColumns1776650000000 implements MigrationInterface {
  name = 'AddManagerOwnershipColumns1776650000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type === 'postgres' ? 'uuid' : 'varchar';

    if (!(await queryRunner.hasColumn('stores', 'createdByUserId'))) {
      await queryRunner.query(`ALTER TABLE "stores" ADD COLUMN "createdByUserId" ${type}`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_stores_createdByUserId" ON "stores" ("createdByUserId")`);
    }

    if (!(await queryRunner.hasColumn('users', 'createdByUserId'))) {
      await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "createdByUserId" ${type}`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_createdByUserId" ON "users" ("createdByUserId")`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'createdByUserId')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_createdByUserId"`);
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "createdByUserId"`);
    }

    if (await queryRunner.hasColumn('stores', 'createdByUserId')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stores_createdByUserId"`);
      await queryRunner.query(`ALTER TABLE "stores" DROP COLUMN "createdByUserId"`);
    }
  }
}
