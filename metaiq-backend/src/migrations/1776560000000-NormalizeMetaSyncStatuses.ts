import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeMetaSyncStatuses1776560000000 implements MigrationInterface {
  name = 'NormalizeMetaSyncStatuses1776560000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      UPDATE "store_integrations"
      SET "status" = 'NOT_CONNECTED'
      WHERE "status" = 'DISCONNECTED'
    `);
    await queryRunner.query(`
      UPDATE "store_integrations"
      SET "lastSyncStatus" = 'IN_PROGRESS'
      WHERE "lastSyncStatus" IN ('PENDING', 'SYNCING')
    `);
    await queryRunner.query(`
      UPDATE "ad_accounts"
      SET "syncStatus" = 'IN_PROGRESS'
      WHERE "syncStatus" IN ('PENDING', 'SYNCING')
    `);
    await queryRunner.query(`
      UPDATE "ad_accounts"
      SET "syncStatus" = 'SUCCESS'
      WHERE "syncStatus" = 'IMPORTED'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      UPDATE "ad_accounts"
      SET "syncStatus" = 'IMPORTED'
      WHERE "syncStatus" = 'SUCCESS'
        AND "provider" = 'META'
        AND "externalId" IS NOT NULL
    `);
  }
}
