import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1776170000000 implements MigrationInterface {
  name = 'InitialSchema1776170000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type;

    if (type === 'postgres') {
      await this.upPostgres(queryRunner);
      return;
    }

    await this.upSqlite(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const type = queryRunner.connection.options.type;

    if (type === 'postgres') {
      await this.downPostgres(queryRunner);
      return;
    }

    await this.downSqlite(queryRunner);
  }

  private async upPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "password" varchar NOT NULL,
        "role" varchar NOT NULL DEFAULT 'OPERATIONAL',
        "refreshToken" varchar,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ad_accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "metaId" varchar NOT NULL,
        "name" varchar NOT NULL,
        "currency" varchar,
        "accessToken" varchar,
        "tokenExpiresAt" date,
        "active" boolean NOT NULL DEFAULT true,
        "userId" uuid NOT NULL REFERENCES "users"("id"),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ad_accounts_userId" ON "ad_accounts" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ad_accounts_metaId" ON "ad_accounts" ("metaId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaigns" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "metaId" varchar NOT NULL,
        "name" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "objective" varchar NOT NULL DEFAULT 'CONVERSIONS',
        "dailyBudget" numeric(10,2) NOT NULL,
        "score" numeric(6,2) NOT NULL DEFAULT 0,
        "startTime" timestamp NOT NULL,
        "endTime" timestamp,
        "userId" uuid NOT NULL REFERENCES "users"("id"),
        "adAccountId" uuid NOT NULL REFERENCES "ad_accounts"("id"),
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_userId" ON "campaigns" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_adAccountId" ON "campaigns" ("adAccountId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_metaId" ON "campaigns" ("metaId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metrics_daily" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "campaignId" uuid NOT NULL REFERENCES "campaigns"("id"),
        "date" date NOT NULL,
        "impressions" integer NOT NULL,
        "clicks" integer NOT NULL,
        "spend" numeric(10,2) NOT NULL,
        "conversions" integer NOT NULL,
        "revenue" numeric(10,2) NOT NULL,
        "ctr" numeric(6,4) NOT NULL,
        "cpa" numeric(10,2) NOT NULL,
        "roas" numeric(6,2) NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_metrics_daily_campaignId" ON "metrics_daily" ("campaignId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_metrics_daily_date" ON "metrics_daily" ("date")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "insights" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "campaignId" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
        "type" varchar NOT NULL,
        "severity" varchar NOT NULL,
        "message" text NOT NULL,
        "recommendation" text NOT NULL,
        "resolved" boolean NOT NULL DEFAULT false,
        "priority" varchar NOT NULL DEFAULT 'medium',
        "lastTriggeredAt" timestamp,
        "cooldownInHours" integer NOT NULL DEFAULT 0,
        "ruleVersion" integer NOT NULL DEFAULT 1,
        "detectedAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_insights_campaignId_resolved" ON "insights" ("campaignId", "resolved")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_insights_detectedAt" ON "insights" ("detectedAt")`);
  }

  private async upSqlite(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys = ON`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY NOT NULL,
        "email" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "password" varchar NOT NULL,
        "role" varchar NOT NULL DEFAULT ('OPERATIONAL'),
        "refreshToken" varchar,
        "active" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ad_accounts" (
        "id" varchar PRIMARY KEY NOT NULL,
        "metaId" varchar NOT NULL,
        "name" varchar NOT NULL,
        "currency" varchar,
        "accessToken" varchar,
        "tokenExpiresAt" date,
        "active" boolean NOT NULL DEFAULT (1),
        "userId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_ad_accounts_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ad_accounts_userId" ON "ad_accounts" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ad_accounts_metaId" ON "ad_accounts" ("metaId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "campaigns" (
        "id" varchar PRIMARY KEY NOT NULL,
        "metaId" varchar NOT NULL,
        "name" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT ('ACTIVE'),
        "objective" varchar NOT NULL DEFAULT ('CONVERSIONS'),
        "dailyBudget" decimal(10,2) NOT NULL,
        "score" decimal(6,2) NOT NULL DEFAULT (0),
        "startTime" datetime NOT NULL,
        "endTime" datetime,
        "userId" varchar NOT NULL,
        "adAccountId" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_campaigns_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_campaigns_adAccountId" FOREIGN KEY ("adAccountId") REFERENCES "ad_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_userId" ON "campaigns" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_adAccountId" ON "campaigns" ("adAccountId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_campaigns_metaId" ON "campaigns" ("metaId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metrics_daily" (
        "id" varchar PRIMARY KEY NOT NULL,
        "campaignId" varchar NOT NULL,
        "date" date NOT NULL,
        "impressions" integer NOT NULL,
        "clicks" integer NOT NULL,
        "spend" decimal(10,2) NOT NULL,
        "conversions" integer NOT NULL,
        "revenue" decimal(10,2) NOT NULL,
        "ctr" decimal(6,4) NOT NULL,
        "cpa" decimal(10,2) NOT NULL,
        "roas" decimal(6,2) NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_metrics_daily_campaignId" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_metrics_daily_campaignId" ON "metrics_daily" ("campaignId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_metrics_daily_date" ON "metrics_daily" ("date")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "insights" (
        "id" varchar PRIMARY KEY NOT NULL,
        "campaignId" varchar NOT NULL,
        "type" varchar NOT NULL,
        "severity" varchar NOT NULL,
        "message" text NOT NULL,
        "recommendation" text NOT NULL,
        "resolved" boolean NOT NULL DEFAULT (0),
        "priority" varchar NOT NULL DEFAULT ('medium'),
        "lastTriggeredAt" datetime,
        "cooldownInHours" integer NOT NULL DEFAULT (0),
        "ruleVersion" integer NOT NULL DEFAULT (1),
        "detectedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_insights_campaignId" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_insights_campaignId_resolved" ON "insights" ("campaignId", "resolved")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_insights_detectedAt" ON "insights" ("detectedAt")`);
  }

  private async downPostgres(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "insights"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metrics_daily"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ad_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }

  private async downSqlite(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "insights"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metrics_daily"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ad_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
