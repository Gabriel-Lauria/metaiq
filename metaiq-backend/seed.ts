/**
 * Seed de dados de demonstração para o metaIQ.
 * Cria um usuário, contas, campanhas e 30 dias de métricas.
 *
 * Uso:
 *   npm run seed
 *
 * Credenciais criadas:
 *   Email:  demo@metaiq.dev
 *   Senha:  Demo@1234
 */

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ quiet: true } as dotenv.DotenvConfigOptions & { quiet: true });

import { User }        from './src/modules/users/user.entity';
import { Manager }     from './src/modules/managers/manager.entity';
import { Store }       from './src/modules/stores/store.entity';
import { UserStore }   from './src/modules/user-stores/user-store.entity';
import { AdAccount }   from './src/modules/ad-accounts/ad-account.entity';
import { Campaign }    from './src/modules/campaigns/campaign.entity';
import { MetricDaily } from './src/modules/metrics/metric-daily.entity';
import { Insight }      from './src/modules/insights/insight.entity';
import { MetricsEngine } from './src/modules/metrics/metrics.engine';
import { InitialSchema1776170000000 } from './src/migrations/1776170000000-InitialSchema';
import { AddRoleToUsers1776260000000 } from './src/migrations/1776260000000-AddRoleToUsers';
import { AddTenantStoreModel1776350000000 } from './src/migrations/1776350000000-AddTenantStoreModel';
import { Role } from './src/common/enums/role.enum';

// ── Validação de variáveis de ambiente ────────────────────────
const validateEnv = () => {
  const required = ['JWT_SECRET', 'CRYPTO_SECRET'];
  const missing = required.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(`❌ Variáveis de ambiente faltando: ${missing.join(', ')}`);
    console.error('   Edite o arquivo .env com valores únicos');
    process.exit(1);
  }
};

validateEnv();

const DB_PATH = process.env.SQLITE_PATH ?? './data/metaiq.db';
const DB_TYPE = process.env.DATABASE_TYPE ?? (process.env.POSTGRES_DB ? 'postgres' : 'sqlite');

// ── Utilitários para cálculos monetários ────────────────────────
const roundMoney = (n: number): number => Math.round(n * 100) / 100;
const safeCharAt = (str: string, idx: number): number => str.charCodeAt(idx) ?? 65; // 65 = 'A'

const DEMO_PASSWORD = 'Demo@1234';

async function ensureDemoUser(
  userRepo: ReturnType<DataSource['getRepository']>,
  data: {
    name: string;
    email: string;
    role: Role;
    managerId?: string | null;
  },
): Promise<User> {
  let user = await userRepo.findOne({ where: { email: data.email } }) as User | null;

  if (!user) {
    const password = await bcrypt.hash(DEMO_PASSWORD, 12);
    user = userRepo.create({
      name: data.name,
      email: data.email,
      password,
      role: data.role,
      managerId: data.managerId ?? null,
      active: true,
    }) as User;
    await userRepo.save(user);
    console.log(`👤 Usuário criado: ${data.email} / ${DEMO_PASSWORD} (${data.role})`);
    return user;
  }

  user.role = data.role;
  user.managerId = data.managerId ?? null;
  user.active = true;
  user.password = await bcrypt.hash(DEMO_PASSWORD, 12);
  await userRepo.save(user);
  console.log(`👤 Usuário demo atualizado: ${data.email} (${data.role})`);
  return user;
}

async function seed() {
  // Garante que a pasta existe
  const dir = path.dirname(path.resolve(DB_PATH));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ds = new DataSource({
    type: DB_TYPE === 'postgres' ? 'postgres' : 'sqlite',
    ...(DB_TYPE === 'postgres'
      ? {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
          username: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD || 'postgres',
          database: process.env.POSTGRES_DB || 'metaiq',
        }
      : {
          database: DB_PATH,
          busyTimeout: 5000,
        }),
    entities: [User, Manager, Store, UserStore, AdAccount, Campaign, MetricDaily, Insight],
    migrations: [InitialSchema1776170000000, AddRoleToUsers1776260000000, AddTenantStoreModel1776350000000],
    synchronize: false,
    logging: false,
  } as any);

  await ds.initialize();
  await ds.runMigrations();
  console.log(DB_TYPE === 'postgres'
    ? `🗄️  Banco PostgreSQL pronto em: ${process.env.POSTGRES_DB || 'metaiq'}`
    : `🗄️  Banco SQLite pronto em: ${DB_PATH}`);

  const engine = new MetricsEngine();

  // ── Usuários e tenant demo ────────────────────────────────
  const userRepo = ds.getRepository(User);
  const managerRepo = ds.getRepository(Manager);
  let manager = await managerRepo.findOne({ where: { name: 'Manager Demo' } });

  if (!manager) {
    manager = await managerRepo.save(managerRepo.create({ name: 'Manager Demo' }));
    console.log('🏢 Manager criado:', manager.name);
  }

  const adminUser = await ensureDemoUser(userRepo, {
    name: 'Admin Demo',
    email: 'admin@metaiq.dev',
    role: Role.ADMIN,
    managerId: null,
  });

  const managerUser = await ensureDemoUser(userRepo, {
    name: 'Manager Demo',
    email: 'manager@metaiq.dev',
    role: Role.MANAGER,
    managerId: manager.id,
  });

  const operationalUser = await ensureDemoUser(userRepo, {
    name: 'Operacional Demo',
    email: 'operational@metaiq.dev',
    role: Role.OPERATIONAL,
    managerId: manager.id,
  });

  const clientUser = await ensureDemoUser(userRepo, {
    name: 'Cliente Demo',
    email: 'client@metaiq.dev',
    role: Role.CLIENT,
    managerId: manager.id,
  });

  const user = await ensureDemoUser(userRepo, {
    name: 'Demo User',
    email: 'demo@metaiq.dev',
    role: Role.MANAGER,
    managerId: manager.id,
  });

  const storeRepo = ds.getRepository(Store);
  let store = await storeRepo.findOne({ where: { name: 'Loja Demo - E-commerce', managerId: manager.id } });

  if (!store) {
    store = await storeRepo.save(storeRepo.create({ name: 'Loja Demo - E-commerce', managerId: manager.id }));
    console.log('🏬 Loja criada:', store.name);
  }

  const userStoreRepo = ds.getRepository(UserStore);
  const storeUsers = [managerUser, operationalUser, clientUser, user];

  for (const storeUser of storeUsers) {
    const existingUserStore = await userStoreRepo.findOne({
      where: { userId: storeUser.id, storeId: store.id },
    });

    if (!existingUserStore) {
      await userStoreRepo.save(userStoreRepo.create({ userId: storeUser.id, storeId: store.id }));
      console.log(`🔗 ${storeUser.email} vinculado à loja demo`);
    }
  }

  // ── Conta de anúncio ──────────────────────────────────────
  const accRepo = ds.getRepository(AdAccount);
  let account = await accRepo.findOne({ where: { userId: user.id } });

  if (!account) {
    account = accRepo.create({
      metaId: 'act_123456789',
      name: 'Conta Demo — E-commerce',
      accessToken: 'demo_token_nao_funcional',
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      userId: user.id,
      storeId: store.id,
    });
    await accRepo.save(account);
    console.log('🔗 Conta Meta criada:', account.metaId);
  } else if (!account.storeId) {
    account.storeId = store.id;
    await accRepo.save(account);
  }

  // ── Campanhas ─────────────────────────────────────────────
  const campRepo = ds.getRepository(Campaign);
  const metRepo  = ds.getRepository(MetricDaily);

  const campaignDefs = [
    { metaId: 'seed_camp_001', name: 'Conversão — Ecommerce Principal', status: 'ACTIVE'  as const, budget: 150, ctrBase: 0.032, cpaBase: 28,  revenueMultiplier: 5.2 },
    { metaId: 'seed_camp_002', name: 'Leads — Formulário B2B',          status: 'ACTIVE'  as const, budget: 80,  ctrBase: 0.018, cpaBase: 72,  revenueMultiplier: 1.4 },
    { metaId: 'seed_camp_003', name: 'Remarketing — Carrinho Abandonado',status: 'ACTIVE'  as const, budget: 60,  ctrBase: 0.048, cpaBase: 15,  revenueMultiplier: 7.8 },
    { metaId: 'seed_camp_004', name: 'Brand Awareness Q1',               status: 'PAUSED' as const, budget: 200, ctrBase: 0.009, cpaBase: 0,   revenueMultiplier: 0   },
    { metaId: 'seed_camp_005', name: 'Catálogo Dinâmico — Verão',        status: 'ACTIVE'  as const, budget: 120, ctrBase: 0.024, cpaBase: 44,  revenueMultiplier: 3.1 },
  ];

  for (const def of campaignDefs) {
    let camp = await campRepo.findOne({ where: { metaId: def.metaId } });

    if (!camp) {
      camp = campRepo.create({
        metaId:     def.metaId,
        name:       def.name,
        status:     def.status,
        objective:  def.cpaBase > 0 ? 'CONVERSIONS' : 'REACH',
        dailyBudget: def.budget,
        userId:     user.id,
        storeId:    store.id,
        createdByUserId: user.id,
        adAccountId: account.id,
        startTime:  new Date('2026-03-01'),
      });
      await campRepo.save(camp);
    } else if (!camp.storeId || !camp.createdByUserId) {
      camp.storeId = camp.storeId ?? store.id;
      camp.createdByUserId = camp.createdByUserId ?? user.id;
      await campRepo.save(camp);
    }

    // Métricas dos últimos 30 dias
    const today = new Date();
    let totalRaw = { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 };

    for (let d = 29; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];

      // Já existe? pular
      const exists = await metRepo.findOne({ where: { campaignId: camp.id, date: dateStr } });
      if (exists) continue;

      // Variação diária com seed determinístico
      const seed = (safeCharAt(def.metaId, 9) + d) * 0.1;
      const jitter = (Math.sin(seed) + 1) / 2; // 0..1

      const impressions = Math.round((3000 + jitter * 4000) * (def.budget / 100));
      const clicks      = Math.round(impressions * def.ctrBase * (0.85 + jitter * 0.3));
      const spend       = roundMoney(def.budget * (0.7 + jitter * 0.6));
      const conversions = def.cpaBase > 0 ? Math.round(spend / def.cpaBase * (0.8 + jitter * 0.4)) : 0;
      const revenue     = roundMoney(conversions * spend * def.revenueMultiplier / Math.max(conversions, 1) * (0.9 + jitter * 0.2));

      const raw = { impressions, clicks, spend, conversions, revenue };
      const computed = engine.compute(raw);
      totalRaw.impressions += impressions;
      totalRaw.clicks      += clicks;
      totalRaw.spend       += spend;
      totalRaw.conversions += conversions;
      totalRaw.revenue     += revenue;

      await metRepo.save(metRepo.create({ campaignId: camp.id, date: dateStr, ...raw, ctr: computed.ctr, cpa: computed.cpa, roas: computed.roas }));
    }

    // Atualizar score da campanha
    const agg = engine.compute(totalRaw);
    await campRepo.update(camp.id, { score: agg.score });

    console.log(`📊 ${def.name.padEnd(40)} score=${agg.score.toString().padStart(3)} ROAS=${agg.roas.toFixed(2)}× CPA=R$${agg.cpa.toFixed(0)}`);
  }

  await ds.destroy();
  console.log('\n✅ Seed concluído! Acesse com: demo@metaiq.dev / Demo@1234');
}

seed().catch((err) => {
  console.error('❌ Erro no seed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
