import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceStoreIdRequired1776640000000 implements MigrationInterface {
  name = 'EnforceStoreIdRequired1776640000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await this.assertNoNullStoreIds(queryRunner, 'campaigns');
    await this.assertNoNullStoreIds(queryRunner, 'ad_accounts');

    await queryRunner.query(`
      ALTER TABLE "campaigns"
      ALTER COLUMN "storeId" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "ad_accounts"
      ALTER COLUMN "storeId" SET NOT NULL
    `);

    await this.validateCheckConstraintIfExists(
      queryRunner,
      'campaigns',
      'CHK_campaigns_storeId_not_null_future',
    );
    await this.validateCheckConstraintIfExists(
      queryRunner,
      'ad_accounts',
      'CHK_ad_accounts_storeId_not_null_future',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "ad_accounts"
      ALTER COLUMN "storeId" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "campaigns"
      ALTER COLUMN "storeId" DROP NOT NULL
    `);
  }

  private async assertNoNullStoreIds(
    queryRunner: QueryRunner,
    tableName: 'campaigns' | 'ad_accounts',
  ): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT id
      FROM "${tableName}"
      WHERE "storeId" IS NULL
      LIMIT 10
    `);

    if (rows.length > 0) {
      throw new Error(
        `Não é seguro aplicar NOT NULL em ${tableName}.storeId: existem registros órfãos. Migre para uma store válida, exclua os registros inválidos ou faça saneamento manual antes desta migration.`,
      );
    }
  }

  private async validateCheckConstraintIfExists(
    queryRunner: QueryRunner,
    tableName: 'campaigns' | 'ad_accounts',
    constraintName: string,
  ): Promise<void> {
    const rows = await queryRunner.query(
      `
        SELECT 1
        FROM pg_constraint
        WHERE conname = $1
      `,
      [constraintName],
    );

    if (rows.length === 0) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "${tableName}"
      VALIDATE CONSTRAINT "${constraintName}"
    `);
  }
}
