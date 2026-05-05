import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserOnboardingCompletion1776870000000 implements MigrationInterface {
  name = 'AddUserOnboardingCompletion1776870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "onboardingCompletedAt"
    `);
  }
}
