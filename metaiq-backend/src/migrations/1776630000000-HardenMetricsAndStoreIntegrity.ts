import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenMetricsAndStoreIntegrity1776630000000 implements MigrationInterface {
  name = 'HardenMetricsAndStoreIntegrity1776630000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoDuplicateMetrics(queryRunner);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_metrics_daily_campaignId_date_unique"
      ON "metrics_daily" ("campaignId", "date")
    `);

    if (queryRunner.connection.options.type === 'postgres') {
      await this.addPostgresNotNullCheckIfMissing(
        queryRunner,
        'campaigns',
        'CHK_campaigns_storeId_not_null_future',
        'storeId',
      );
      await this.addPostgresNotNullCheckIfMissing(
        queryRunner,
        'ad_accounts',
        'CHK_ad_accounts_storeId_not_null_future',
        'storeId',
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ad_accounts" DROP CONSTRAINT IF EXISTS "CHK_ad_accounts_storeId_not_null_future"`);
      await queryRunner.query(`ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "CHK_campaigns_storeId_not_null_future"`);
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_metrics_daily_campaignId_date_unique"`);
  }

  private async assertNoDuplicateMetrics(queryRunner: QueryRunner): Promise<void> {
    const duplicates = await queryRunner.query(`
      SELECT "campaignId", "date", COUNT(*) AS count
      FROM "metrics_daily"
      GROUP BY "campaignId", "date"
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (duplicates.length > 0) {
      throw new Error(
        'Não é seguro criar índice único em metrics_daily(campaignId, date): existem métricas duplicadas. Consolide os registros antes da migration.',
      );
    }
  }

  private async addPostgresNotNullCheckIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    columnName: string,
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
      CHECK ("${columnName}" IS NOT NULL) NOT VALID
    `);
  }
}
