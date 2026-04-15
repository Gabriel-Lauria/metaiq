import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantStoreModel1776350000000 implements MigrationInterface {
  name = 'AddTenantStoreModel1776350000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "managers" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "name" varchar NOT NULL,
          "active" boolean NOT NULL DEFAULT true,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now()
        )
      `);

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "stores" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "name" varchar NOT NULL,
          "managerId" uuid NOT NULL REFERENCES "managers"("id"),
          "active" boolean NOT NULL DEFAULT true,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now()
        )
      `);

      await this.addColumnIfMissing(queryRunner, 'users', 'managerId', 'uuid');
      await this.addColumnIfMissing(queryRunner, 'ad_accounts', 'storeId', 'uuid');
      await this.addColumnIfMissing(queryRunner, 'campaigns', 'storeId', 'uuid');
      await this.addColumnIfMissing(queryRunner, 'campaigns', 'createdByUserId', 'uuid');

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "user_stores" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "storeId" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
          "createdAt" timestamp NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_user_stores_user_store" UNIQUE ("userId", "storeId")
        )
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "managers" (
          "id" varchar PRIMARY KEY NOT NULL,
          "name" varchar NOT NULL,
          "active" boolean NOT NULL DEFAULT (1),
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "stores" (
          "id" varchar PRIMARY KEY NOT NULL,
          "name" varchar NOT NULL,
          "managerId" varchar NOT NULL,
          "active" boolean NOT NULL DEFAULT (1),
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          CONSTRAINT "FK_stores_managerId" FOREIGN KEY ("managerId") REFERENCES "managers"("id")
        )
      `);

      await this.addColumnIfMissing(queryRunner, 'users', 'managerId', 'varchar');
      await this.addColumnIfMissing(queryRunner, 'ad_accounts', 'storeId', 'varchar');
      await this.addColumnIfMissing(queryRunner, 'campaigns', 'storeId', 'varchar');
      await this.addColumnIfMissing(queryRunner, 'campaigns', 'createdByUserId', 'varchar');

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "user_stores" (
          "id" varchar PRIMARY KEY NOT NULL,
          "userId" varchar NOT NULL,
          "storeId" varchar NOT NULL,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          CONSTRAINT "UQ_user_stores_user_store" UNIQUE ("userId", "storeId"),
          CONSTRAINT "FK_user_stores_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
          CONSTRAINT "FK_user_stores_storeId" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE
        )
      `);
    }

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_managerId" ON "users" ("managerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_stores_managerId" ON "stores" ("managerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_stores_userId" ON "user_stores" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_stores_storeId" ON "user_stores" ("storeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ad_accounts_storeId" ON "ad_accounts" ("storeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_storeId" ON "campaigns" ("storeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_createdByUserId" ON "campaigns" ("createdByUserId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_campaigns_createdByUserId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_campaigns_storeId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ad_accounts_storeId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_stores_storeId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_stores_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stores_managerId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_managerId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_stores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "managers"`);
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnType: string,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    const hasColumn = table?.columns.some((column) => column.name === columnName);

    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnType}`);
    }
  }
}
