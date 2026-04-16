import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostgresRelationalIntegrity1776274000000 implements MigrationInterface {
  name = 'AddPostgresRelationalIntegrity1776274000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await this.addForeignKeyIfMissing(
      queryRunner,
      'users',
      'FK_users_managerId',
      `"managerId"`,
      'managers',
      `"id"`,
      'SET NULL',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'ad_accounts',
      'FK_ad_accounts_storeId',
      `"storeId"`,
      'stores',
      `"id"`,
      'SET NULL',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'campaigns',
      'FK_campaigns_storeId',
      `"storeId"`,
      'stores',
      `"id"`,
      'SET NULL',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'campaigns',
      'FK_campaigns_createdByUserId',
      `"createdByUserId"`,
      'users',
      `"id"`,
      'SET NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "FK_campaigns_createdByUserId"`);
    await queryRunner.query(`ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "FK_campaigns_storeId"`);
    await queryRunner.query(`ALTER TABLE "ad_accounts" DROP CONSTRAINT IF EXISTS "FK_ad_accounts_storeId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_managerId"`);
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    columnSql: string,
    referencedTableName: string,
    referencedColumnSql: string,
    onDelete: 'SET NULL' | 'CASCADE' | 'NO ACTION',
  ): Promise<void> {
    const exists = await queryRunner.query(
      `
        SELECT 1
        FROM pg_constraint
        WHERE conname = $1
      `,
      [constraintName],
    );

    if (exists.length > 0) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "${tableName}"
      ADD CONSTRAINT "${constraintName}"
      FOREIGN KEY (${columnSql})
      REFERENCES "${referencedTableName}"(${referencedColumnSql})
      ON DELETE ${onDelete}
    `);
  }
}
