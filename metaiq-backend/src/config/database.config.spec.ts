describe('database config production hardening', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects sqlite in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_TYPE = 'sqlite';

    await expect(import('./database.config')).rejects.toThrow('DB_TYPE must be postgres in production');
  });

  it('rejects synchronize in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_TYPE = 'postgres';
    process.env.TYPEORM_SYNCHRONIZE = 'true';

    await expect(import('./database.config')).rejects.toThrow('TYPEORM_SYNCHRONIZE must be false in production');
  });
});
