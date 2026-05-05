import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandAssetsForMetaImageHashFlow1776860000000 implements MigrationInterface {
  name = 'ExpandAssetsForMetaImageHashFlow1776860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "adAccountId" uuid`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "originalName" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "fileName" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "metaRawImageId" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "metaRawResponse" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "metaRawResponse"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "metaRawImageId"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "fileName"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "originalName"`);
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "adAccountId"`);
  }
}
