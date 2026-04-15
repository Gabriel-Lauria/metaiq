import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleToUsers1776260000000 implements MigrationInterface {
  name = 'AddRoleToUsers1776260000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const hasRole = table?.columns.some((column) => column.name === 'role');

    if (hasRole) {
      return;
    }

    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE "users"
        ADD COLUMN "role" varchar NOT NULL DEFAULT 'OPERATIONAL'
      `);
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "role" varchar NOT NULL DEFAULT ('OPERATIONAL')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const hasRole = table?.columns.some((column) => column.name === 'role');

    if (!hasRole) {
      return;
    }

    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
      return;
    }

    await queryRunner.dropColumn('users', 'role');
  }
}
