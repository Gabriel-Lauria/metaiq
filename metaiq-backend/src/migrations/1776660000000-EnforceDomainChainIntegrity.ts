import { MigrationInterface, QueryRunner } from "typeorm";

export class EnforceDomainChainIntegrity1776660000000 implements MigrationInterface {
  name = "EnforceDomainChainIntegrity1776660000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== "postgres") {
      return;
    }

    await this.assertNoBrokenCampaignChains(queryRunner);
    await this.assertNoBrokenMetaCreationChains(queryRunner);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_campaigns_storeId_adAccountId" ON "campaigns" ("storeId", "adAccountId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_meta_campaign_creations_storeId_adAccountId" ON "meta_campaign_creations" ("storeId", "adAccountId")`,
    );

    await this.replaceStoreForeignKey(
      queryRunner,
      "ad_accounts",
      "FK_ad_accounts_storeId",
    );
    await this.replaceStoreForeignKey(
      queryRunner,
      "campaigns",
      "FK_campaigns_storeId",
    );

    await this.addConstraintIfMissing(
      queryRunner,
      "UQ_ad_accounts_id_storeId",
      `ALTER TABLE "ad_accounts" ADD CONSTRAINT "UQ_ad_accounts_id_storeId" UNIQUE ("id", "storeId")`,
    );

    await this.addConstraintIfMissing(
      queryRunner,
      "FK_campaigns_adAccount_store_chain",
      `
        ALTER TABLE "campaigns"
        ADD CONSTRAINT "FK_campaigns_adAccount_store_chain"
        FOREIGN KEY ("adAccountId", "storeId")
        REFERENCES "ad_accounts"("id", "storeId")
        ON DELETE NO ACTION
        ON UPDATE NO ACTION
      `,
    );

    await this.addConstraintIfMissing(
      queryRunner,
      "FK_meta_campaign_creations_adAccount_store_chain",
      `
        ALTER TABLE "meta_campaign_creations"
        ADD CONSTRAINT "FK_meta_campaign_creations_adAccount_store_chain"
        FOREIGN KEY ("adAccountId", "storeId")
        REFERENCES "ad_accounts"("id", "storeId")
        ON DELETE NO ACTION
        ON UPDATE NO ACTION
      `,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== "postgres") {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "meta_campaign_creations" DROP CONSTRAINT IF EXISTS "FK_meta_campaign_creations_adAccount_store_chain"`,
    );
    await queryRunner.query(
      `ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "FK_campaigns_adAccount_store_chain"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ad_accounts" DROP CONSTRAINT IF EXISTS "UQ_ad_accounts_id_storeId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_meta_campaign_creations_storeId_adAccountId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_campaigns_storeId_adAccountId"`,
    );
  }

  private async replaceStoreForeignKey(
    queryRunner: QueryRunner,
    tableName: "ad_accounts" | "campaigns",
    constraintName: string,
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "${tableName}" DROP CONSTRAINT IF EXISTS "${constraintName}"`,
    );
    await queryRunner.query(`
      ALTER TABLE "${tableName}"
      ADD CONSTRAINT "${constraintName}"
      FOREIGN KEY ("storeId")
      REFERENCES "stores"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION
    `);
  }

  private async addConstraintIfMissing(
    queryRunner: QueryRunner,
    constraintName: string,
    sql: string,
  ): Promise<void> {
    const exists = await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`,
      [constraintName],
    );
    if (!exists.length) {
      await queryRunner.query(sql);
    }
  }

  private async assertNoBrokenCampaignChains(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const broken = await queryRunner.query(`
      SELECT campaign.id, campaign."storeId", campaign."adAccountId", ad_account."storeId" AS "adAccountStoreId"
      FROM "campaigns" campaign
      LEFT JOIN "ad_accounts" ad_account ON ad_account.id = campaign."adAccountId"
      WHERE campaign."storeId" IS NULL
        OR campaign."adAccountId" IS NULL
        OR ad_account.id IS NULL
        OR ad_account."storeId" IS DISTINCT FROM campaign."storeId"
      LIMIT 10
    `);

    if (broken.length > 0) {
      throw new Error(
        "Não é seguro aplicar integridade campaign -> adAccount -> store: existem campanhas com cadeia estrutural quebrada.",
      );
    }
  }

  private async assertNoBrokenMetaCreationChains(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const tableExists = await queryRunner.hasTable("meta_campaign_creations");
    if (!tableExists) {
      return;
    }

    const broken = await queryRunner.query(`
      SELECT creation.id, creation."storeId", creation."adAccountId", ad_account."storeId" AS "adAccountStoreId"
      FROM "meta_campaign_creations" creation
      LEFT JOIN "ad_accounts" ad_account ON ad_account.id = creation."adAccountId"
      WHERE creation."storeId" IS NULL
        OR creation."adAccountId" IS NULL
        OR ad_account.id IS NULL
        OR ad_account."storeId" IS DISTINCT FROM creation."storeId"
      LIMIT 10
    `);

    if (broken.length > 0) {
      throw new Error(
        "Não é seguro aplicar integridade meta_campaign_creations -> adAccount -> store: existem execuções Meta com cadeia estrutural quebrada.",
      );
    }
  }
}
