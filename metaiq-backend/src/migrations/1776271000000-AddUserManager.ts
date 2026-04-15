import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserManager1776271000000 implements MigrationInterface {
  name = 'AddUserManager1776271000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('users', 'managerId'))) {
      const type = queryRunner.connection.options.type === 'postgres' ? 'uuid' : 'varchar';
      await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "managerId" ${type}`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_managerId" ON "users" ("managerId")`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'managerId')) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_managerId"`);
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "managerId"`);
    }
  }
}
