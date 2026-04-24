import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenReferentialIntegrityForProduction1776700000000 implements MigrationInterface {
  name = 'HardenReferentialIntegrityForProduction1776700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await this.nullifyBrokenCreatedByReferences(queryRunner, 'users');
    await this.nullifyBrokenCreatedByReferences(queryRunner, 'stores');
    await this.nullifyBrokenCreatedByReferences(queryRunner, 'campaigns');

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_createdByUserId" ON "campaigns" ("createdByUserId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_createdByUserId" ON "users" ("createdByUserId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_stores_createdByUserId" ON "stores" ("createdByUserId")`);

    await this.replaceConstraint(
      queryRunner,
      'users',
      'FK_users_createdByUserId',
      `
        ALTER TABLE "users"
        ADD CONSTRAINT "FK_users_createdByUserId"
        FOREIGN KEY ("createdByUserId")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE NO ACTION
      `,
    );

    await this.replaceConstraint(
      queryRunner,
      'stores',
      'FK_stores_createdByUserId',
      `
        ALTER TABLE "stores"
        ADD CONSTRAINT "FK_stores_createdByUserId"
        FOREIGN KEY ("createdByUserId")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE NO ACTION
      `,
    );

    await this.replaceConstraint(
      queryRunner,
      'campaigns',
      'FK_campaigns_createdByUserId',
      `
        ALTER TABLE "campaigns"
        ADD CONSTRAINT "FK_campaigns_createdByUserId"
        FOREIGN KEY ("createdByUserId")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE NO ACTION
      `,
    );

    await this.replaceConstraint(
      queryRunner,
      'insights',
      'FK_insights_campaignId',
      `
        ALTER TABLE "insights"
        ADD CONSTRAINT "FK_insights_campaignId"
        FOREIGN KEY ("campaignId")
        REFERENCES "campaigns"("id")
        ON DELETE NO ACTION
        ON UPDATE NO ACTION
      `,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`ALTER TABLE "insights" DROP CONSTRAINT IF EXISTS "FK_insights_campaignId"`);
    await queryRunner.query(`
      ALTER TABLE "insights"
      ADD CONSTRAINT "FK_insights_campaignId"
      FOREIGN KEY ("campaignId")
      REFERENCES "campaigns"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "FK_campaigns_createdByUserId"`);
    await queryRunner.query(`ALTER TABLE "stores" DROP CONSTRAINT IF EXISTS "FK_stores_createdByUserId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_createdByUserId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_campaigns_createdByUserId"`);
  }

  private async nullifyBrokenCreatedByReferences(
    queryRunner: QueryRunner,
    tableName: 'users' | 'stores' | 'campaigns',
  ): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(tableName, 'createdByUserId');
    if (!hasColumn) {
      return;
    }

    await queryRunner.query(`
      UPDATE "${tableName}" target
      SET "createdByUserId" = NULL
      WHERE target."createdByUserId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "users" creator
          WHERE creator."id" = target."createdByUserId"
        )
    `);
  }

  private async replaceConstraint(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    addSql: string,
  ): Promise<void> {
    await queryRunner.query(`ALTER TABLE "${tableName}" DROP CONSTRAINT IF EXISTS "${constraintName}"`);
    await queryRunner.query(addSql);
  }
}
