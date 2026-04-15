import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateManagersStoresUserStores1776270000000 implements MigrationInterface {
  name = 'CreateManagersStoresUserStores1776270000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type;

    if (!(await queryRunner.hasTable('managers'))) {
      await queryRunner.query(
        type === 'postgres'
          ? `
            CREATE TABLE "managers" (
              "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              "name" varchar NOT NULL,
              "active" boolean NOT NULL DEFAULT true,
              "createdAt" timestamp NOT NULL DEFAULT now(),
              "updatedAt" timestamp NOT NULL DEFAULT now()
            )
          `
          : `
            CREATE TABLE "managers" (
              "id" varchar PRIMARY KEY NOT NULL,
              "name" varchar NOT NULL,
              "active" boolean NOT NULL DEFAULT (1),
              "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
              "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
          `,
      );
    }

    if (!(await queryRunner.hasTable('stores'))) {
      await queryRunner.query(
        type === 'postgres'
          ? `
            CREATE TABLE "stores" (
              "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              "name" varchar NOT NULL,
              "managerId" uuid NOT NULL REFERENCES "managers"("id"),
              "active" boolean NOT NULL DEFAULT true,
              "createdAt" timestamp NOT NULL DEFAULT now(),
              "updatedAt" timestamp NOT NULL DEFAULT now()
            )
          `
          : `
            CREATE TABLE "stores" (
              "id" varchar PRIMARY KEY NOT NULL,
              "name" varchar NOT NULL,
              "managerId" varchar NOT NULL,
              "active" boolean NOT NULL DEFAULT (1),
              "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
              "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
              CONSTRAINT "FK_stores_managerId" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
            )
          `,
      );
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_stores_managerId" ON "stores" ("managerId")`);
    }

    if (!(await queryRunner.hasTable('user_stores'))) {
      await queryRunner.query(
        type === 'postgres'
          ? `
            CREATE TABLE "user_stores" (
              "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
              "storeId" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
              "createdAt" timestamp NOT NULL DEFAULT now()
            )
          `
          : `
            CREATE TABLE "user_stores" (
              "id" varchar PRIMARY KEY NOT NULL,
              "userId" varchar NOT NULL,
              "storeId" varchar NOT NULL,
              "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
              CONSTRAINT "FK_user_stores_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
              CONSTRAINT "FK_user_stores_storeId" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
          `,
      );
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_stores_userId_storeId" ON "user_stores" ("userId", "storeId")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_stores_storeId" ON "user_stores" ("storeId")`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_stores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "managers"`);
  }
}
