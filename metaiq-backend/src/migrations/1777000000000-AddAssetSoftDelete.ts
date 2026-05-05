import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAssetSoftDelete1777000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('assets', 'archivedAt'))) {
      await queryRunner.addColumn(
        'assets',
        new TableColumn({
          name: 'archivedAt',
          type: 'timestamp',
          isNullable: true,
          default: null,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('assets', 'deletedAt'))) {
      await queryRunner.addColumn(
        'assets',
        new TableColumn({
          name: 'deletedAt',
          type: 'timestamp',
          isNullable: true,
          default: null,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('assets', 'deletedAt')) {
      await queryRunner.dropColumn('assets', 'deletedAt');
    }
    if (await queryRunner.hasColumn('assets', 'archivedAt')) {
      await queryRunner.dropColumn('assets', 'archivedAt');
    }
  }
}
