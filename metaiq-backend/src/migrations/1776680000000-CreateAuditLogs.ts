import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1776680000000 implements MigrationInterface {
  name = 'CreateAuditLogs1776680000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "action" character varying NOT NULL,
        "status" character varying(16) NOT NULL,
        "actorId" uuid,
        "actorRole" character varying,
        "tenantId" uuid,
        "targetType" character varying,
        "targetId" character varying,
        "reason" character varying,
        "requestId" character varying,
        "metadata" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actorId" ON "audit_logs" ("actorId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_tenantId" ON "audit_logs" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action" ON "audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_target" ON "audit_logs" ("targetType", "targetId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_requestId" ON "audit_logs" ("requestId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_requestId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_target"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_tenantId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_actorId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
