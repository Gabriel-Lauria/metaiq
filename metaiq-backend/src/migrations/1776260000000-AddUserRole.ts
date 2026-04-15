import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRole1776260000000 implements MigrationInterface {
  name = 'AddUserRole1776260000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasRole = await queryRunner.hasColumn('users', 'role');
    if (hasRole) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "role" varchar NOT NULL DEFAULT ('OPERATIONAL')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const hasRole = await queryRunner.hasColumn('users', 'role');
    if (!hasRole) {
      return;
    }

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
  }
}
