/**
 * Seed de dados de demonstração para o metaIQ.
 * Cria um usuário, contas, campanhas e 30 dias de métricas.
 *
 * Uso:
 *   npm run seed
 *
 * Credenciais demo criadas:
 *   Master: definido por PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD
 *   Email:  demo@metaiq.dev
 *   Senha:  Demo@1234
 */

import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ quiet: true } as dotenv.DotenvConfigOptions & { quiet: true });

import { User }        from './src/modules/users/user.entity';
import { Role }        from './src/common/enums';
import { Manager }     from './src/modules/managers/manager.entity';
import { Tenant }      from './src/modules/tenants/tenant.entity';
import { Store }       from './src/modules/stores/store.entity';
import { UserStore }   from './src/modules/user-stores/user-store.entity';
import { AdAccount }   from './src/modules/ad-accounts/ad-account.entity';
import { Campaign }    from './src/modules/campaigns/campaign.entity';
import { MetricDaily } from './src/modules/metrics/metric-daily.entity';
import { Insight }      from './src/modules/insights/insight.entity';
import { MetricsEngine } from './src/modules/metrics/metrics.engine';
import AppDataSource from './src/data-source';

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

const getEnv = (...names: string[]): string | undefined => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') {
      return value;
    }
  }

  return undefined;
};

const DB_TYPE = getEnv('DB_TYPE', 'DATABASE_TYPE') ?? 'postgres';
const DB_PATH = getEnv('SQLITE_PATH', 'DATABASE') ?? './data/metaiq.db';
const PLATFORM_ADMIN_EMAIL = getEnv('PLATFORM_ADMIN_EMAIL');
const PLATFORM_ADMIN_PASSWORD = getEnv('PLATFORM_ADMIN_PASSWORD');
const PLATFORM_ADMIN_NAME = getEnv('PLATFORM_ADMIN_NAME') ?? 'Administrador da Plataforma';

// ── Utilitários para cálculos monetários ────────────────────────
const roundMoney = (n: number): number => Math.round(n * 100) / 100;
const safeCharAt = (str: string, idx: number): number => str.charCodeAt(idx) ?? 65; // 65 = 'A'

// ── Interface para tipo de insight gerado ────────────────────────
interface InsightToCreate {
  type: 'alert' | 'warning' | 'opportunity' | 'info';
  severity: 'danger' | 'warning' | 'success' | 'info';
  message: string;
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Gera insights automáticos com base no desempenho agregado de uma campanha
 */
async function generateInsights(
  insightRepo: Repository<Insight>,
  campaign: Campaign,
  metrics: any,
  totalRaw: any,
  metricsByDay: { [day: number]: any }
): Promise<void> {
  const insights: InsightToCreate[] = [];

  // ── ROAS Analysis ────────────────────────────────────────────────
  if (metrics.roas < 0.5) {
    insights.push({
      type: 'alert',
      severity: 'danger',
      message: `⚠️ ROAS CRÍTICO: R$${metrics.roas.toFixed(2)} por R$1 gasto. Campanha gerando prejuízo.`,
      recommendation: 'Pausar campanha imediatamente ou revisar direcionamento, criativo e oferta.',
      priority: 'high',
    });
  } else if (metrics.roas < 1.5) {
    insights.push({
      type: 'warning',
      severity: 'danger',
      message: `⚠️ ROAS ABAIXO DA META: R$${metrics.roas.toFixed(2)}. Margem muito baixa.`,
      recommendation:
        'Revisar público alvo, melhorar criativo ou aumentar valor da oferta. Considere pausar se não melhorar em 7 dias.',
      priority: 'high',
    });
  } else if (metrics.roas > 5) {
    insights.push({
      type: 'opportunity',
      severity: 'success',
      message: `🎉 ROAS EXCELENTE: R$${metrics.roas.toFixed(2)}! Campanha altamente lucrativa.`,
      recommendation: 'Aumentar orçamento gradualmente (10-20% por dia) para escalar retorno.',
      priority: 'medium',
    });
  }

  // ── CTR Analysis ────────────────────────────────────────────────
  const ctr = (metrics.ctr || 0) / 100;
  if (ctr < 0.005) {
    insights.push({
      type: 'warning',
      severity: 'warning',
      message: `📉 CTR MUITO BAIXO: ${(ctr * 100).toFixed(3)}%. Criativo ou público podem estar desalinhados.`,
      recommendation: 'Testar criativo novo (imagem/vídeo diferente) ou refinar segmentação demográfica.',
      priority: 'medium',
    });
  } else if (ctr > 0.05) {
    insights.push({
      type: 'opportunity',
      severity: 'success',
      message: `✨ CTR EXCELENTE: ${(ctr * 100).toFixed(3)}%! Criativo está gerando muita curiosidade.`,
      recommendation: 'Criativo está bem. Foco agora em melhorar a página de destino para aumentar conversões.',
      priority: 'low',
    });
  }

  // ── CPA Analysis ────────────────────────────────────────────────
  if (metrics.cpa > 0) {
    if (metrics.cpa > 200) {
      insights.push({
        type: 'warning',
        severity: 'warning',
        message: `💰 CPA MUITO ALTO: R$${metrics.cpa.toFixed(0)} por conversão. Não é sustentável.`,
        recommendation:
          'Revisar processo de conversão, remover etapas desnecessárias do formulário ou aumentar preço da oferta.',
        priority: 'medium',
      });
    } else if (metrics.cpa < 30 && totalRaw.conversions > 10) {
      insights.push({
        type: 'opportunity',
        severity: 'success',
        message: `⭐ CPA EFICIENTE: R$${metrics.cpa.toFixed(0)} por conversão com volume bom.`,
        recommendation: 'Aumentar orçamento com segurança. Padrão está estabelecido.',
        priority: 'low',
      });
    }
  }

  // ── Conversão Analysis ────────────────────────────────────────────
  if (metrics.cpa > 0 && totalRaw.conversions === 0) {
    insights.push({
      type: 'alert',
      severity: 'danger',
      message: `❌ SEM CONVERSÕES: Campanha gastou R$${totalRaw.spend.toFixed(0)} mas não gerou nenhuma conversão.`,
      recommendation:
        'Verificar: página de destino está funcionando? Pixel está instalado? Considere pausar em 24h se não melhorar.',
      priority: 'high',
    });
  } else if (metrics.cpa > 0 && totalRaw.conversions < 3) {
    insights.push({
      type: 'warning',
      severity: 'warning',
      message: `⚠️ CONVERSÕES MUITO BAIXAS: Apenas ${totalRaw.conversions} em ${Math.round(totalRaw.spend / 100)} R$ gastos.`,
      recommendation: 'Aumentar tempo de teste (7+ dias) antes de pausar. Verifique landing page e fluxo de conversão.',
      priority: 'medium',
    });
  }

  // ── Spend Analysis ────────────────────────────────────────────────
  if (totalRaw.spend < 50) {
    insights.push({
      type: 'info',
      severity: 'info',
      message: `📊 DADOS INSUFICIENTES: Apenas R$${totalRaw.spend.toFixed(0)} gastos. Aguarde mais volume.`,
      recommendation: 'Dados ainda estão sendo coletados. Volte em 48h para análise mais confiável.',
      priority: 'low',
    });
  }

  // ── Status Analysis ────────────────────────────────────────────────
  if (campaign.status === 'PAUSED') {
    insights.push({
      type: 'info',
      severity: 'info',
      message: `⏸️ CAMPANHA PAUSADA: ${campaign.name} não está gerando dados novos.`,
      recommendation: 'Reativar se quiser continuar. Verifique os insights acima antes de reiniciar.',
      priority: 'low',
    });
  }

  // ── Trend Analysis (primeiros 30 dias vs últimos 30 dias) ─────────
  if (Object.keys(metricsByDay).length >= 30) {
    const daysArray = Object.keys(metricsByDay).map(Number).sort((a, b) => b - a);
    const firstHalf = daysArray.slice(45).reverse(); // Dias 45-90
    const secondHalf = daysArray.slice(0, 45); // Dias 0-45

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      let roas1 = 0,
        roas2 = 0;
      firstHalf.forEach(d => {
        roas1 += metricsByDay[d].roas || 0;
      });
      secondHalf.forEach(d => {
        roas2 += metricsByDay[d].roas || 0;
      });
      roas1 /= firstHalf.length;
      roas2 /= secondHalf.length;

      const roasChange = ((roas2 - roas1) / Math.max(roas1, 0.01)) * 100;

      if (roasChange < -30) {
        insights.push({
          type: 'warning',
          severity: 'danger',
          message: `📉 TENDÊNCIA DE PIORA: ROAS caiu ${Math.abs(roasChange).toFixed(0)}% nos últimos 45 dias.`,
          recommendation:
            'Público pode estar saturado. Considere expandir segmentação ou testar novo criativo urgentemente.',
          priority: 'high',
        });
      } else if (roasChange > 40) {
        insights.push({
          type: 'opportunity',
          severity: 'success',
          message: `📈 TENDÊNCIA DE MELHORA: ROAS subiu ${roasChange.toFixed(0)}% nos últimos 45 dias!`,
          recommendation: 'Campanha está encontrando seu ritmo. Manter estratégia atual e aumentar orçamento.',
          priority: 'medium',
        });
      }
    }
  }

  // ── Frequência Analysis (impressões elevadas, cliques baixos) ──────
  if (totalRaw.impressions > 50000 && ctr < 0.01) {
    insights.push({
      type: 'warning',
      severity: 'warning',
      message: `🔄 FREQUÊNCIA ALTA, CTR BAIXO: ${totalRaw.impressions} impressões mas poucos cliques.`,
      recommendation:
        'Público pode estar saturado. Expandir público ou criar novo criativo para evitar banner blindness.',
      priority: 'medium',
    });
  }

  // Salvar todos os insights (se não existem)
  for (const insightData of insights) {
    const existing = await insightRepo.findOne({
      where: {
        campaignId: campaign.id,
        message: insightData.message,
        resolved: false,
      },
    });

    if (!existing) {
      const insight = insightRepo.create({
        campaignId: campaign.id,
        ...insightData,
        detectedAt: new Date(),
      });
      await insightRepo.save(insight);
    }
  }
}

async function seed() {
  if (DB_TYPE === 'sqlite') {
    const dir = path.dirname(path.resolve(DB_PATH));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const ds: DataSource = AppDataSource;
  await ds.initialize();
  await ds.runMigrations();
  console.log(
    DB_TYPE === 'sqlite'
      ? `🗄️  Banco SQLite pronto em: ${DB_PATH}`
      : `🗄️  Banco PostgreSQL pronto em: ${getEnv('DB_NAME', 'POSTGRES_DB', 'DATABASE') ?? 'metaiq'}`,
  );

  const engine = new MetricsEngine();

  // ── Manager e loja demo ───────────────────────────────────
  const managerRepo = ds.getRepository(Manager);
  const tenantRepo = ds.getRepository(Tenant);
  let manager = await managerRepo.findOne({ where: { name: 'Gestor Demo' } });

  if (!manager) {
    manager = managerRepo.create({ name: 'Gestor Demo', active: true });
    await managerRepo.save(manager);
    console.log('🏢 Manager criado: Gestor Demo');
  } else {
    console.log('🏢 Manager demo já existe — pulando criação.');
  }

  let tenant = await tenantRepo.findOne({ where: { id: manager.id } });
  if (!tenant) {
    tenant = tenantRepo.create({ id: manager.id, name: manager.name });
    await tenantRepo.save(tenant);
    console.log('🏢 Tenant criado para Gestor Demo');
  } else if (tenant.name !== manager.name) {
    tenant.name = manager.name;
    await tenantRepo.save(tenant);
  }

  const storeRepo = ds.getRepository(Store);
  let store = await storeRepo.findOne({ where: { name: 'Loja Demo', tenantId: tenant.id } });

  if (!store) {
    store = storeRepo.create({ name: 'Loja Demo', managerId: manager.id, tenantId: tenant.id, active: true });
    await storeRepo.save(store);
    console.log('🏬 Loja criada: Loja Demo');
  } else {
    console.log('🏬 Loja demo já existe — pulando criação.');
  }

  // ── Usuário demo ──────────────────────────────────────────
  const userRepo = ds.getRepository(User);
  await ensurePlatformAdmin(userRepo);

  let user = await userRepo.findOne({ where: { email: 'demo@metaiq.dev' } });

  const password = await bcrypt.hash('Demo@1234', 12);

  if (!user) {
    user = userRepo.create({
      name: 'Demo User',
      email: 'demo@metaiq.dev',
      password,
      role: Role.ADMIN,
      managerId: manager.id,
      tenantId: tenant.id,
    });
    await userRepo.save(user);
    console.log('👤 Usuário criado: demo@metaiq.dev / Demo@1234');
  } else {
    // Sempre atualizar senha e dados do user demo
    user.password = password;
    if (!user.managerId) {
      user.managerId = manager.id;
    }
    user.tenantId = user.tenantId ?? tenant.id;
    user.active = true;
    user.role = Role.ADMIN; // Ensure demo user has admin role
    await userRepo.save(user);
    console.log('👤 Usuário demo atualizado com senha: Demo@1234');
  }

  const userStoreRepo = ds.getRepository(UserStore);
  const userStore = await userStoreRepo.findOne({
    where: { userId: user.id, storeId: store.id },
  });

  if (!userStore) {
    await userStoreRepo.save(userStoreRepo.create({ userId: user.id, storeId: store.id }));
    console.log('🔐 Usuário vinculado à Loja Demo');
  }

  if (!store.createdByUserId) {
    store.createdByUserId = user.id;
    await storeRepo.save(store);
  }

  const demoPassword = await bcrypt.hash('Demo@1234', 12);
  const ensureDemoUser = async (input: {
    name: string;
    email: string;
    role: Role;
    createdByUserId?: string | null;
  }): Promise<User> => {
    let demoUser = await userRepo.findOne({ where: { email: input.email } });
    if (!demoUser) {
      demoUser = userRepo.create({
        name: input.name,
        email: input.email,
        password: demoPassword,
        role: input.role,
        managerId: manager.id,
        tenantId: tenant.id,
        createdByUserId: input.createdByUserId ?? user.id,
        active: true,
      });
    } else {
      demoUser.name = input.name;
      demoUser.password = demoPassword;
      demoUser.role = input.role;
      demoUser.managerId = manager.id;
      demoUser.tenantId = tenant.id;
      demoUser.createdByUserId = demoUser.createdByUserId ?? input.createdByUserId ?? user.id;
      demoUser.active = true;
      demoUser.deletedAt = null;
    }

    return userRepo.save(demoUser);
  };

  const managerUser = await ensureDemoUser({
    name: 'Marina Supervisor',
    email: 'manager@metaiq.dev',
    role: Role.MANAGER,
    createdByUserId: user.id,
  });
  const operationalUser = await ensureDemoUser({
    name: 'Otavio Trafego',
    email: 'operacional@metaiq.dev',
    role: Role.OPERATIONAL,
    createdByUserId: managerUser.id,
  });
  const analystUser = await ensureDemoUser({
    name: 'Bianca Performance',
    email: 'analista@metaiq.dev',
    role: Role.OPERATIONAL,
    createdByUserId: managerUser.id,
  });
  const clientUser = await ensureDemoUser({
    name: 'Cliente Final Demo',
    email: 'cliente@metaiq.dev',
    role: Role.CLIENT,
    createdByUserId: managerUser.id,
  });

  const ensureUserStore = async (userId: string, storeId: string): Promise<void> => {
    const exists = await userStoreRepo.findOne({ where: { userId, storeId } });
    if (!exists) {
      await userStoreRepo.save(userStoreRepo.create({ userId, storeId }));
    }
  };

  const demoStoreDefs = [
    { name: 'Loja Demo', owner: user, operators: [operationalUser, analystUser], client: clientUser },
    { name: 'Aurora Moda', owner: managerUser, operators: [operationalUser], client: clientUser },
    { name: 'Nexa Fitness', owner: managerUser, operators: [analystUser], client: clientUser },
    { name: 'Casa Vila Decor', owner: user, operators: [operationalUser], client: null },
    { name: 'Bistro Jardim', owner: managerUser, operators: [operationalUser, analystUser], client: null },
  ];

  const demoStores: Store[] = [];
  for (const def of demoStoreDefs) {
    let demoStore = await storeRepo.findOne({ where: { name: def.name, tenantId: tenant.id } });
    if (!demoStore) {
      demoStore = storeRepo.create({
        name: def.name,
        managerId: manager.id,
        tenantId: tenant.id,
        createdByUserId: def.owner.id,
        active: true,
      });
    } else {
      demoStore.managerId = manager.id;
      demoStore.tenantId = tenant.id;
      demoStore.createdByUserId = demoStore.createdByUserId ?? def.owner.id;
      demoStore.active = true;
      demoStore.deletedAt = null;
    }

    demoStore = await storeRepo.save(demoStore);
    demoStores.push(demoStore);

    await ensureUserStore(user.id, demoStore.id);
    await ensureUserStore(managerUser.id, demoStore.id);
    for (const operator of def.operators) {
      await ensureUserStore(operator.id, demoStore.id);
    }
    if (def.client) {
      await ensureUserStore(def.client.id, demoStore.id);
    }
  }

  // ── Conta de anúncio ──────────────────────────────────────
  const accRepo = ds.getRepository(AdAccount);
  const accountByStore = new Map<string, AdAccount>();
  for (const [index, demoStore] of demoStores.entries()) {
    const metaId = `act_demo_${String(index + 1).padStart(3, '0')}`;
    let account = await accRepo.findOne({ where: { metaId } });

    if (!account) {
      account = accRepo.create({
        metaId,
        provider: 'META' as any,
        externalId: metaId,
        syncStatus: 'SUCCESS' as any,
        importedAt: new Date(),
        lastSeenAt: new Date(),
        name: `Conta Meta — ${demoStore.name}`,
        currency: 'BRL',
        accessToken: 'demo_token_nao_funcional',
        tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        active: true,
        userId: user.id,
        storeId: demoStore.id,
      });
    } else {
      account.name = `Conta Meta — ${demoStore.name}`;
      account.externalId = account.externalId ?? metaId;
      account.syncStatus = 'SUCCESS' as any;
      account.importedAt = account.importedAt ?? new Date();
      account.lastSeenAt = new Date();
      account.currency = account.currency ?? 'BRL';
      account.active = true;
      account.userId = user.id;
      account.storeId = demoStore.id;
    }

    account = await accRepo.save(account);
    accountByStore.set(demoStore.id, account);
  }
  console.log(`🔗 Contas Meta demo prontas: ${accountByStore.size}`);

  // ── Campanhas ─────────────────────────────────────────────
  const campRepo = ds.getRepository(Campaign);
  const metRepo  = ds.getRepository(MetricDaily);
  const insightRepo = ds.getRepository(Insight);

  /**
   * Definição de campanhas com características realistas para demonstração.
   * 
   * Estrutura:
   * - metaId: ID único da campanha
   * - name: Nome descritivo
   * - status: ACTIVE, PAUSED, ARCHIVED
   * - budget: Orçamento diário em R$
   * - ctrBase: CTR esperado (0-1 em decimal)
   * - cpaBase: CPA esperado em R$ (0 para campanhas sem conversão)
   * - revenueMultiplier: Quanto cada R$ gasto gera em receita
   * - trendMultiplier: Multiplicador de tendência (1.0 = flat, >1 = melhora, <1 = piora)
   * - startDay: Em qual dia dos últimos 90 começou (90 = há 90 dias, 0 = hoje)
   */
  const campaignDefs = [
    // ✅ Campanhas EXCELENTES (ROAS > 4, CTR > 2.5%)
    {
      metaId: 'seed_camp_001',
      name: 'Remarketing — Carrinho Abandonado',
      status: 'ACTIVE' as const,
      budget: 80,
      ctrBase: 0.065,
      cpaBase: 12,
      revenueMultiplier: 8.5,
      trendMultiplier: 1.02,
      startDay: 90,
    },
    {
      metaId: 'seed_camp_002',
      name: 'Conversão — Black Friday Flash Sales',
      status: 'ACTIVE' as const,
      budget: 180,
      ctrBase: 0.048,
      cpaBase: 18,
      revenueMultiplier: 7.2,
      trendMultiplier: 1.01,
      startDay: 45,
    },

    // 🟡 Campanhas BOM DESEMPENHO (ROAS 2.5-4, CTR 1.5-2.5%)
    {
      metaId: 'seed_camp_003',
      name: 'Conversão — Ecommerce Principal',
      status: 'ACTIVE' as const,
      budget: 200,
      ctrBase: 0.032,
      cpaBase: 32,
      revenueMultiplier: 5.5,
      trendMultiplier: 0.99,
      startDay: 90,
    },
    {
      metaId: 'seed_camp_004',
      name: 'Tráfego — Novo Produto Launch',
      status: 'ACTIVE' as const,
      budget: 120,
      ctrBase: 0.028,
      cpaBase: 28,
      revenueMultiplier: 3.8,
      trendMultiplier: 1.03,
      startDay: 60,
    },
    {
      metaId: 'seed_camp_005',
      name: 'Leads — B2B SaaS Trial',
      status: 'ACTIVE' as const,
      budget: 60,
      ctrBase: 0.022,
      cpaBase: 85,
      revenueMultiplier: 1.8,
      trendMultiplier: 1.00,
      startDay: 75,
    },

    // ⚠️ Campanhas ATENÇÃO (ROAS 1.5-2.5, CTR 1-1.5%)
    {
      metaId: 'seed_camp_006',
      name: 'Catálogo Dinâmico — Verão 2026',
      status: 'ACTIVE' as const,
      budget: 150,
      ctrBase: 0.018,
      cpaBase: 48,
      revenueMultiplier: 2.8,
      trendMultiplier: 0.97,
      startDay: 70,
    },
    {
      metaId: 'seed_camp_007',
      name: 'Video Awareness — Série YouTubers',
      status: 'ACTIVE' as const,
      budget: 100,
      ctrBase: 0.012,
      cpaBase: 0,
      revenueMultiplier: 0,
      trendMultiplier: 0.98,
      startDay: 80,
    },

    // 🔴 Campanhas CRÍTICA (ROAS < 1.5 ou sem conversão)
    {
      metaId: 'seed_camp_008',
      name: 'Brand Awareness — Display Network',
      status: 'ACTIVE' as const,
      budget: 90,
      ctrBase: 0.005,
      cpaBase: 0,
      revenueMultiplier: 0,
      trendMultiplier: 0.92,
      startDay: 50,
    },
    {
      metaId: 'seed_camp_009',
      name: 'Leads — Newsletter Upgrade',
      status: 'ACTIVE' as const,
      budget: 40,
      ctrBase: 0.008,
      cpaBase: 125,
      revenueMultiplier: 0.5,
      trendMultiplier: 0.88,
      startDay: 60,
    },

    // ⏸ Campanhas PAUSADAS (com histórico)
    {
      metaId: 'seed_camp_010',
      name: 'Q1 Seasonal Campaign — Encerrada',
      status: 'PAUSED' as const,
      budget: 200,
      ctrBase: 0.015,
      cpaBase: 55,
      revenueMultiplier: 2.2,
      trendMultiplier: 0.95,
      startDay: 90,
    },
    {
      metaId: 'seed_camp_011',
      name: 'Experimento — Público Novo',
      status: 'PAUSED' as const,
      budget: 50,
      ctrBase: 0.003,
      cpaBase: 250,
      revenueMultiplier: 0.1,
      trendMultiplier: 0.75,
      startDay: 90,
    },

    // 📊 Campanha COM FORTE PIORA (para alertas)
    {
      metaId: 'seed_camp_012',
      name: 'Conversão — Antigo Público (Decaindo)',
      status: 'ACTIVE' as const,
      budget: 110,
      ctrBase: 0.018,
      cpaBase: 38,
      revenueMultiplier: 1.9,
      trendMultiplier: 0.80, // -20% ao longo dos 90 dias
      startDay: 90,
    },
  ];

  for (const storeIndex of demoStores.keys()) {
    const demoStore = demoStores[storeIndex];
    const account = accountByStore.get(demoStore.id)!;
    const campaignSlice = campaignDefs.map((def, defIndex) => ({
      ...def,
      metaId: `${def.metaId}_store_${storeIndex + 1}`,
      name: storeIndex === 0 ? def.name : `${demoStore.name} — ${def.name}`,
      budget: roundMoney(def.budget * (0.75 + storeIndex * 0.12 + (defIndex % 3) * 0.05)),
    }));

  for (const def of campaignSlice) {
    let camp = await campRepo.findOne({ where: { metaId: def.metaId } });

    if (!camp) {
      camp = campRepo.create({
        metaId: def.metaId,
        name: def.name,
        status: def.status,
        objective: def.cpaBase > 0 ? 'CONVERSIONS' : 'REACH',
        dailyBudget: def.budget,
        userId: user.id,
        storeId: demoStore.id,
        createdByUserId: user.id,
        adAccountId: account.id,
        startTime: new Date(Date.now() - def.startDay * 86400000),
      });
      await campRepo.save(camp);
    } else if (!camp.storeId || !camp.createdByUserId) {
      camp.storeId = camp.storeId ?? store.id;
      camp.createdByUserId = camp.createdByUserId ?? user.id;
      await campRepo.save(camp);
    }

    // ── Métricas dos últimos 90 dias ────────────────────────────
    const today = new Date();
    let totalRaw = { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 };
    const metricsByDay: { [day: number]: any } = {};

    for (let d = 89; d >= 0; d--) {
      // Pular dias anteriores ao início da campanha
      if (d > def.startDay) continue;

      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];

      // Já existe? pular
      const exists = await metRepo.findOne({ where: { campaignId: camp.id, date: dateStr } });
      if (exists) continue;

      // Variação diária com seed determinístico + tendência
      const seed = (safeCharAt(def.metaId, 9) + d) * 0.1;
      const jitter = (Math.sin(seed) + 1) / 2; // 0..1

      // Aplicar tendência ao longo do tempo (primeiros dias vs últimos dias)
      const dayProgress = 1 - d / 90; // 0 no dia 90, 1 hoje
      const trendEffect = def.trendMultiplier ** dayProgress; // Aplicar trend exponencialmente

      const impressions = Math.round((3000 + jitter * 4000) * (def.budget / 100) * trendEffect);
      const clicks = Math.round(impressions * def.ctrBase * (0.85 + jitter * 0.3) * trendEffect);
      const spend = roundMoney(def.budget * (0.7 + jitter * 0.6) * trendEffect);
      const conversions =
        def.cpaBase > 0 ? Math.round((spend / def.cpaBase) * (0.8 + jitter * 0.4)) : 0;
      const revenue = roundMoney(
        (conversions *
          spend *
          def.revenueMultiplier) /
          Math.max(conversions, 1) *
          (0.9 + jitter * 0.2)
      );

      const raw = { impressions, clicks, spend, conversions, revenue };
      const computed = engine.compute(raw);
      totalRaw.impressions += impressions;
      totalRaw.clicks += clicks;
      totalRaw.spend += spend;
      totalRaw.conversions += conversions;
      totalRaw.revenue += revenue;
      metricsByDay[d] = computed;

      await metRepo.save(
        metRepo.create({
          campaignId: camp.id,
          date: dateStr,
          ...raw,
          ctr: computed.ctr,
          cpa: computed.cpa,
          roas: computed.roas,
        })
      );
    }

    // Atualizar score da campanha
    const agg = engine.compute(totalRaw);
    await campRepo.update(camp.id, { score: agg.score });

    // ── Gerar insights automáticos para a campanha ────────────
    await generateInsights(insightRepo, camp, agg, totalRaw, metricsByDay);

    console.log(
      `📊 ${def.name.padEnd(45)} score=${agg.score
        .toString()
        .padStart(3)} ROAS=${agg.roas.toFixed(2)}× CPA=R$${agg.cpa.toFixed(0)}`
    );
  }
  }

  await ds.destroy();
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('✅ SEED COMPLETADO COM SUCESSO!');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('\n📊 DADOS CRIADOS:');
  console.log(`   • ${demoStores.length} stores/clientes da agência`);
  console.log(`   • ${demoStores.length} contas Meta fake`);
  console.log(`   • ${demoStores.length * campaignDefs.length} campanhas distribuídas por store`);
  console.log('   • 90 dias de histórico de métricas');
  console.log('   • Dozens de insights automáticos');
  console.log('   • Usuários ADMIN, MANAGER, OPERATIONAL e CLIENT para validar permissões');
  console.log('   • Variações realistas de performance');
  console.log('   • Tendências de melhora/piora');
  console.log('\n🔐 CREDENCIAIS DE ACESSO:');
  console.log('   Email: demo@metaiq.dev');
  console.log('   Senha: Demo@1234');
  console.log('   Manager: manager@metaiq.dev / Demo@1234');
  console.log('   Operacional: operacional@metaiq.dev / Demo@1234');
  console.log('   Cliente: cliente@metaiq.dev / Demo@1234');
  console.log('\n🎯 O QUE VER:');
  console.log('   1. Dashboard com KPIs agregados');
  console.log('   2. Campanhas com diferentes performances');
  console.log('   3. Insights automáticos por campanha');
  console.log('   4. Gráficos de tendência (90 dias)');
  console.log('   5. Kanban operacional com alertas');
  console.log('\n═══════════════════════════════════════════════════════════════════\n');
}

async function ensurePlatformAdmin(userRepo: Repository<User>): Promise<void> {
  if (!PLATFORM_ADMIN_EMAIL || !PLATFORM_ADMIN_PASSWORD) {
    console.warn('⚠️  PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD não definidos — usuário master não foi criado.');
    return;
  }

  if (PLATFORM_ADMIN_PASSWORD.length < 12) {
    throw new Error('PLATFORM_ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
  }

  const email = PLATFORM_ADMIN_EMAIL.trim().toLowerCase();
  let platformAdmin = await userRepo.findOne({ where: { email } });

  if (platformAdmin && platformAdmin.role !== Role.PLATFORM_ADMIN) {
    throw new Error(`Usuário ${email} já existe, mas não possui role PLATFORM_ADMIN.`);
  }

  const password = await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, 12);
  if (!platformAdmin) {
    platformAdmin = userRepo.create({
      name: PLATFORM_ADMIN_NAME.trim() || 'Administrador da Plataforma',
      email,
      password,
      role: Role.PLATFORM_ADMIN,
      managerId: null,
      tenantId: null,
      active: true,
      deletedAt: null,
    });
    await userRepo.save(platformAdmin);
    console.log(`👑 PLATFORM_ADMIN criado: ${email}`);
    return;
  }

  platformAdmin.name = PLATFORM_ADMIN_NAME.trim() || platformAdmin.name;
  platformAdmin.password = password;
  platformAdmin.role = Role.PLATFORM_ADMIN;
  platformAdmin.managerId = null;
  platformAdmin.tenantId = null;
  platformAdmin.active = true;
  platformAdmin.deletedAt = null;
  await userRepo.save(platformAdmin);
  console.log(`👑 PLATFORM_ADMIN atualizado: ${email}`);
}

seed().catch((err) => {
  console.error('❌ Erro no seed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
