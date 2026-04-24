import { QueryRunner } from 'typeorm';
import { AddTenantCompanyChannels1776820000000 } from '../1776820000000-AddTenantCompanyChannels';

describe('AddTenantCompanyChannels1776820000000', () => {
  it('adds tenant company channel columns for individual company profile persistence', async () => {
    const migration = new AddTenantCompanyChannels1776820000000();
    const queryRunner = {
      connection: {
        options: { type: 'postgres' },
      },
      query: jest.fn(),
    } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.map(([query]) => String(query)).join('\n');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "website"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "instagram"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "whatsapp"');
  });
});
