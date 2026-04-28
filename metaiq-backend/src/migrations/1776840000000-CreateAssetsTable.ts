import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssetsTable1776840000000 implements MigrationInterface {
  name = 'CreateAssetsTable1776840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "storeId" uuid NOT NULL,
        "uploadedByUserId" uuid,
        "type" character varying(16) NOT NULL,
        "mimeType" character varying(120) NOT NULL,
        "size" bigint NOT NULL,
        "width" integer,
        "height" integer,
        "storageUrl" character varying(1000) NOT NULL,
        "metaImageHash" character varying(255),
        "status" character varying(24) NOT NULL DEFAULT 'UPLOADED',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_assets_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_assets_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_assets_uploaded_by_user" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_assets_storeId" ON "assets" ("storeId")`);
    await queryRunner.query(`CREATE INDEX "IDX_assets_uploadedByUserId" ON "assets" ("uploadedByUserId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_assets_uploadedByUserId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_assets_storeId"`);
    await queryRunner.query(`DROP TABLE "assets"`);
  }
}
