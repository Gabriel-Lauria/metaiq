import { QueryRunner } from 'typeorm';
import { AddTenantBusinessProfile1776810000000 } from '../1776810000000-AddTenantBusinessProfile';

describe('AddTenantBusinessProfile1776810000000', () => {
  it('adds tenant business profile columns without affecting existing tenants', async () => {
    const migration = new AddTenantBusinessProfile1776810000000();
    const queryRunner = {
      connection: {
        options: { type: 'postgres' },
      },
      query: jest.fn(),
    } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.map(([query]) => String(query)).join('\n');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "businessName"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "businessSegment"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "defaultCity"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "defaultState"');
  });
});
