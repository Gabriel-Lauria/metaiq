import { QueryRunner } from 'typeorm';
import { AddTenantAccountType1776800000000 } from '../1776800000000-AddTenantAccountType';

describe('AddTenantAccountType1776800000000', () => {
  it('adds accountType with AGENCY default for existing tenants', async () => {
    const migration = new AddTenantAccountType1776800000000();
    const queryRunner = {
      connection: {
        options: { type: 'postgres' },
      },
      query: jest.fn(),
    } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.map(([query]) => String(query)).join('\n');
    expect(sql).toContain('CREATE TYPE "tenants_accounttype_enum" AS ENUM (\'AGENCY\', \'INDIVIDUAL\')');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "accountType" "tenants_accounttype_enum"');
    expect(sql).toContain('DEFAULT \'AGENCY\'');
    expect(sql).toContain('SET "accountType" = \'AGENCY\'');
    expect(sql).toContain('ALTER COLUMN "accountType" SET NOT NULL');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "IDX_tenants_accountType"');
  });
});
