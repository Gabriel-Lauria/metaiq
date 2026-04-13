# 🏗️ MetaIQ — Arquitetura Completa & Guia de Desenvolvimento

**Versão:** 2.0  
**Data:** Abril 2026  
**Status:** Documento de referência para desenvolvimento

---

## 📌 VISÃO GERAL DO DOCUMENTO

Este documento define a arquitetura ideal do MetaIQ do zero ao deploy, com:
- Estrutura de pastas comentada
- Código de cada arquivo com comentários explicativos
- Decisões arquiteturais justificadas
- Roadmap técnico para os próximos passos

---

## 🗂️ ESTRUTURA DE PASTAS — ARQUITETURA DEFINITIVA

```
metaiq/
│
├── 📁 metaiq-backend/               # NestJS — API e regras de negócio
│   ├── src/
│   │   ├── 📁 config/               # Configurações centralizadas (env, db, etc.)
│   │   │   ├── app.config.ts        # Configuração geral da aplicação
│   │   │   ├── database.config.ts   # Configuração TypeORM/SQLite/PostgreSQL
│   │   │   └── jwt.config.ts        # Configuração JWT (secret, expiry, etc.)
│   │   │
│   │   ├── 📁 common/               # Utilitários compartilhados entre módulos
│   │   │   ├── 📁 decorators/       # Decorators customizados (@CurrentUser, etc.)
│   │   │   ├── 📁 filters/          # Filtros de exceção globais
│   │   │   ├── 📁 guards/           # Guards reutilizáveis (JWT, roles)
│   │   │   ├── 📁 interceptors/     # Interceptors (logging, transform response)
│   │   │   ├── 📁 pipes/            # Pipes de validação globais
│   │   │   └── 📁 utils/            # Funções utilitárias puras
│   │   │       ├── crypto.util.ts   # Criptografia AES-256 para tokens Meta
│   │   │       └── metrics.util.ts  # Cálculos de métricas (CTR, CPA, ROAS)
│   │   │
│   │   ├── 📁 modules/              # Domínios de negócio (um módulo por domínio)
│   │   │   ├── 📁 auth/             # Autenticação e autorização
│   │   │   ├── 📁 users/            # Gestão de usuários
│   │   │   ├── 📁 ad-accounts/      # Contas do Meta Ads
│   │   │   ├── 📁 campaigns/        # Campanhas e seus dados
│   │   │   ├── 📁 metrics/          # Métricas diárias (CTR, CPA, ROAS)
│   │   │   ├── 📁 insights/         # Insights automáticos e alertas
│   │   │   └── 📁 meta/             # Integração com Meta Graph API
│   │   │
│   │   ├── 📁 infrastructure/       # Serviços de infraestrutura (cron, queue, etc.)
│   │   │   └── sync.cron.ts         # Cron job de sincronização (1x/hora)
│   │   │
│   │   ├── app.module.ts            # Módulo raiz — registra todos os módulos
│   │   └── main.ts                  # Entry point — bootstrap e configurações globais
│   │
│   ├── 📁 test/                     # Testes e2e
│   ├── .env.example                 # Template do .env (SEM valores reais)
│   ├── .env                         # Variáveis reais (no .gitignore)
│   ├── nest-cli.json
│   ├── tsconfig.json
│   └── package.json
│
├── 📁 metaiq-frontend/              # Express + Vanilla JS — Interface do usuário
│   ├── 📁 src/
│   │   ├── 📁 pages/                # HTMLs de cada página
│   │   │   ├── auth.html            # Login e registro
│   │   │   └── dashboard.html       # Painel principal
│   │   ├── 📁 js/                   # JavaScript modularizado
│   │   │   ├── api.js               # Camada de comunicação com a API
│   │   │   ├── auth.js              # Lógica de autenticação (login, logout, refresh)
│   │   │   ├── dashboard.js         # Lógica do dashboard
│   │   │   ├── charts.js            # Configuração e renderização de gráficos
│   │   │   └── utils.js             # Formatadores (moeda, data, porcentagem)
│   │   └── 📁 css/
│   │       └── main.css             # Estilos globais (variáveis CSS, dark theme)
│   ├── server.js                    # Express server + proxy para backend
│   └── package.json
│
├── 📁 docs/                         # Documentação consolidada
│   ├── ARQUITETURA.md               # Este documento
│   ├── API.md                       # Documentação dos endpoints
│   └── DEPLOY.md                    # Guia de deploy
│
├── docker-compose.yml               # Orquestração local (backend + frontend)
├── .gitignore
└── README.md                        # Overview do projeto
```

---

## ⚙️ BACKEND — CÓDIGO COMPLETO COMENTADO

### `main.ts` — Entry Point

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // ── Validação antecipada de variáveis de ambiente críticas ──────────────
  // Se alguma estiver faltando, o servidor NÃO sobe.
  // Isso evita que o app rode em estado inseguro silenciosamente.
  const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'CRYPTO_SECRET'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`❌ Variável de ambiente obrigatória não definida: ${envVar}`);
      logger.error('   Execute: cp .env.example .env e preencha os valores.');
      process.exit(1); // Falha intencional — melhor do que rodar inseguro
    }
  }

  const app = await NestFactory.create(AppModule);

  // ── Prefixo global da API ───────────────────────────────────────────────
  // Todos os endpoints ficam sob /api/... 
  // Isso permite que o frontend no mesmo domínio use /api/* facilmente
  app.setGlobalPrefix('api');

  // ── Validação global de DTOs ────────────────────────────────────────────
  // whitelist: remove campos não declarados no DTO (proteção contra mass assignment)
  // forbidNonWhitelisted: lança erro 400 se campo extra for enviado
  // transform: converte tipos automaticamente (string "123" → number 123)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // ── CORS ───────────────────────────────────────────────────────────────
  // Em desenvolvimento: aceita requisições do frontend em localhost:4200
  // Em produção: substituir origin pelo domínio real
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true, // Permite envio de cookies (necessário para refresh token)
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`✅ Backend rodando em http://localhost:${port}/api`);
  logger.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
```

---

### `app.module.ts` — Módulo Raiz

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

// Importação dos módulos de domínio
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { InsightsModule } from './modules/insights/insights.module';
import { MetaModule } from './modules/meta/meta.module';
import { AdAccountsModule } from './modules/ad-accounts/ad-accounts.module';

// Importação das configurações tipadas
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';

@Module({
  imports: [
    // ── Configurações de ambiente ─────────────────────────────────────────
    // isGlobal: true → disponível em todos os módulos sem reimportar
    // envFilePath: carrega .env automaticamente
    // load: tipagem e validação das variáveis de ambiente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, jwtConfig],
    }),

    // ── Banco de dados ────────────────────────────────────────────────────
    // autoLoadEntities: registra entidades automaticamente quando o módulo é importado
    // synchronize: true em dev (cria/atualiza tabelas automaticamente)
    //              NUNCA true em produção — usar migrations
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'sqlite',
        database: config.get('database.path'),
        autoLoadEntities: true,
        synchronize: config.get('app.env') === 'development',
        logging: config.get('app.env') === 'development',
      }),
      inject: [ConfigService],
    }),

    // ── Agendamento de tarefas (cron jobs) ────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Rate limiting ─────────────────────────────────────────────────────
    // Proteção contra abuso de API: 100 requisições por 60 segundos por IP
    // PRÓXIMO PASSO: configurar limites diferentes por rota (auth mais restrito)
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // ── Módulos de domínio ─────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    AdAccountsModule,
    CampaignsModule,
    MetricsModule,
    InsightsModule,
    MetaModule,
  ],
})
export class AppModule {}
```

---

### `config/app.config.ts` — Configuração Centralizada

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
}));
```

```typescript
// config/database.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  path: process.env.SQLITE_PATH || './data/metaiq.db',
}));
```

```typescript
// config/jwt.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}));
```

---

### `common/utils/metrics.util.ts` — Cálculos de Métricas

```typescript
export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator || denominator === 0) return 0;
  return numerator / denominator;
}

export function calcCTR(clicks: number, impressions: number): number {
  return safeDiv(clicks, impressions) * 100;
}

export function calcCPC(spend: number, clicks: number): number {
  return safeDiv(spend, clicks);
}

export function calcCPA(spend: number, conversions: number): number {
  return safeDiv(spend, conversions);
}

export function calcROAS(revenue: number, spend: number): number {
  return safeDiv(revenue, spend);
}

export function calcWeightedROAS(
  metrics: Array<{ spend: number; revenue: number }>
): number {
  const totalSpend = metrics.reduce((acc, m) => acc + m.spend, 0);
  const totalRevenue = metrics.reduce((acc, m) => acc + m.revenue, 0);
  return safeDiv(totalRevenue, totalSpend);
}
```

---

### `modules/auth/` — Autenticação Completa

```typescript
// modules/auth/auth.service.ts

import {
  Injectable, UnauthorizedException, ConflictException, Logger
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      ...dto,
      password: hashedPassword,
    });

    this.logger.log(`Novo usuário registrado: ${user.email}`);
    return this.generateTokenPair(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    const passwordValid = user
      ? await bcrypt.compare(dto.password, user.password)
      : await bcrypt.compare(dto.password, '$2b$12$fakehashtopreventtiming......');

    if (!user || !passwordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    this.logger.log(`Login: ${user.email}`);
    return this.generateTokenPair(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret'),
      });

      const user = await this.usersService.findOne(payload.sub);
      if (!user) throw new UnauthorizedException();

      return this.generateTokenPair(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
  }

  private generateTokenPair(user: any) {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.secret'),
      expiresIn: this.configService.get('jwt.expiresIn'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.refreshSecret'),
      expiresIn: this.configService.get('jwt.refreshExpiresIn'),
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
```

---

### `modules/campaigns/` — Campanhas

```typescript
// modules/campaigns/campaign.entity.ts

import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne
} from 'typeorm';
import { MetricDaily } from '../metrics/metric-daily.entity';
import { AdAccount } from '../ad-accounts/ad-account.entity';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  adAccountId: string;

  @ManyToOne(() => AdAccount, { onDelete: 'CASCADE' })
  adAccount: AdAccount;

  @Column()
  name: string;

  @Column({ default: 'active' })
  status: 'active' | 'paused' | 'archived';

  @Column({ nullable: true })
  objective: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  budget: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  dailyBudget: number;

  @Column({ type: 'date', nullable: true })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string;

  @Column({ nullable: true })
  metaCampaignId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => MetricDaily, (m) => m.campaign, { lazy: true })
  metrics: Promise<MetricDaily[]>;
}
```

```typescript
// modules/campaigns/campaigns.service.ts

import {
  Injectable, NotFoundException, Logger
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { FilterCampaignsDto } from './dto/filter-campaigns.dto';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly repo: Repository<Campaign>,
  ) {}

  async findAll(userId: string, filters: FilterCampaignsDto): Promise<Campaign[]> {
    const qb = this.repo.createQueryBuilder('campaign')
      .innerJoin('campaign.adAccount', 'account')
      .where('account.userId = :userId', { userId });

    if (filters.status) {
      qb.andWhere('campaign.status = :status', { status: filters.status });
    }

    if (filters.adAccountId) {
      qb.andWhere('campaign.adAccountId = :adAccountId', {
        adAccountId: filters.adAccountId,
      });
    }

    if (filters.search) {
      qb.andWhere('campaign.name LIKE :search', {
        search: `%${filters.search}%`,
      });
    }

    qb.orderBy('campaign.status', 'ASC')
      .addOrderBy('campaign.updatedAt', 'DESC');

    return qb.getMany();
  }

  async findOne(id: string, userId: string): Promise<Campaign> {
    const campaign = await this.repo.createQueryBuilder('campaign')
      .innerJoin('campaign.adAccount', 'account')
      .where('campaign.id = :id', { id })
      .andWhere('account.userId = :userId', { userId })
      .getOne();

    if (!campaign) {
      throw new NotFoundException(`Campanha ${id} não encontrada`);
    }

    return campaign;
  }

  async create(dto: CreateCampaignDto): Promise<Campaign> {
    const campaign = this.repo.create(dto);
    return this.repo.save(campaign);
  }

  async update(id: string, userId: string, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(id, userId);
    Object.assign(campaign, dto);
    return this.repo.save(campaign);
  }

  async remove(id: string, userId: string): Promise<void> {
    const campaign = await this.findOne(id, userId);
    campaign.status = 'archived';
    await this.repo.save(campaign);
    this.logger.log(`Campanha arquivada: ${id}`);
  }
}
```

---

### `modules/metrics/` — Métricas

```typescript
// modules/metrics/metric-daily.entity.ts

import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Unique, Index
} from 'typeorm';
import { Campaign } from '../campaigns/campaign.entity';

@Entity('metrics_daily')
@Unique(['campaignId', 'date'])
@Index(['campaignId', 'date'])
export class MetricDaily {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  campaignId: string;

  @ManyToOne(() => Campaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;

  @Column({ type: 'date' })
  date: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  spend: number;

  @Column('int', { default: 0 })
  impressions: number;

  @Column('int', { default: 0 })
  clicks: number;

  @Column('int', { default: 0 })
  conversions: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  revenue: number;

  @Column('decimal', { precision: 8, scale: 4, default: 0 })
  ctr: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  cpc: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  cpa: number;

  @Column('decimal', { precision: 8, scale: 4, default: 0 })
  roas: number;
}
```

```typescript
// modules/metrics/metrics.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MetricDaily } from './metric-daily.entity';
import { calcCTR, calcCPC, calcCPA, calcROAS } from '../../common/utils/metrics.util';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @InjectRepository(MetricDaily)
    private readonly repo: Repository<MetricDaily>,
  ) {}

  async getSummary(from: string, to: string, adAccountId?: string) {
    const qb = this.repo.createQueryBuilder('m')
      .where('m.date BETWEEN :from AND :to', { from, to });

    if (adAccountId) {
      qb.innerJoin('m.campaign', 'c')
        .andWhere('c.adAccountId = :adAccountId', { adAccountId });
    }

    const metrics = await qb.getMany();

    if (metrics.length === 0) {
      return this.emptyMetricsSummary();
    }

    const totalSpend       = metrics.reduce((s, m) => s + Number(m.spend), 0);
    const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0);
    const totalClicks      = metrics.reduce((s, m) => s + m.clicks, 0);
    const totalConversions = metrics.reduce((s, m) => s + m.conversions, 0);
    const totalRevenue     = metrics.reduce((s, m) => s + Number(m.revenue), 0);

    const avgCTR  = calcCTR(totalClicks, totalImpressions);
    const avgCPC  = calcCPC(totalSpend, totalClicks);
    const avgCPA  = calcCPA(totalSpend, totalConversions);
    const avgROAS = calcROAS(totalRevenue, totalSpend);

    const byDay = this.groupByDay(metrics);

    return {
      period: { from, to },
      totals: { totalSpend, totalImpressions, totalClicks, totalConversions, totalRevenue },
      averages: { avgCTR, avgCPC, avgCPA, avgROAS },
      byDay,
    };
  }

  async upsertDailyMetric(data: Partial<MetricDaily>): Promise<MetricDaily> {
    const existing = await this.repo.findOne({
      where: { campaignId: data.campaignId, date: data.date },
    });

    const enriched = {
      ...data,
      ctr:  calcCTR(data.clicks, data.impressions),
      cpc:  calcCPC(data.spend, data.clicks),
      cpa:  calcCPA(data.spend, data.conversions),
      roas: calcROAS(data.revenue, data.spend),
    };

    if (existing) {
      Object.assign(existing, enriched);
      return this.repo.save(existing);
    }

    return this.repo.save(this.repo.create(enriched));
  }

  private groupByDay(metrics: MetricDaily[]) {
    const map = new Map<string, typeof metrics[0][]>();

    for (const m of metrics) {
      const arr = map.get(m.date) || [];
      arr.push(m);
      map.set(m.date, arr);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayMetrics]) => ({
        date,
        spend:       dayMetrics.reduce((s, m) => s + Number(m.spend), 0),
        impressions: dayMetrics.reduce((s, m) => s + m.impressions, 0),
        clicks:      dayMetrics.reduce((s, m) => s + m.clicks, 0),
        conversions: dayMetrics.reduce((s, m) => s + m.conversions, 0),
        revenue:     dayMetrics.reduce((s, m) => s + Number(m.revenue), 0),
        roas:        calcROAS(
          dayMetrics.reduce((s, m) => s + Number(m.revenue), 0),
          dayMetrics.reduce((s, m) => s + Number(m.spend), 0),
        ),
      }));
  }

  private emptyMetricsSummary() {
    return {
      totals: { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0, totalRevenue: 0 },
      averages: { avgCTR: 0, avgCPC: 0, avgCPA: 0, avgROAS: 0 },
      byDay: [],
    };
  }
}
```

---

### `modules/insights/` — Motor de Insights

```typescript
// modules/insights/insights.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insight } from './insight.entity';
import { Campaign } from '../campaigns/campaign.entity';
import { MetricsService } from '../metrics/metrics.service';

type InsightPayload = Pick<Insight, 'type' | 'severity' | 'message' | 'recommendation'>;

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  private readonly THRESHOLDS = {
    ROAS_DANGER:      1.0,
    ROAS_WARNING:     2.0,
    ROAS_OPPORTUNITY: 4.0,
    CTR_DANGER:       0.5,
    CTR_WARNING:      1.0,
    CTR_OPPORTUNITY:  3.0,
    CPA_HIGH_RATIO:   0.5,
    CPA_LOW_RATIO:    0.2,
    OVERSPEND_RATIO:  1.1,
    MIN_SPEND_NO_CONV: 50,
    DAYS_NO_DATA:     3,
    DAYS_TO_END:      3,
    LOOKBACK_DAYS:    7,
  };

  constructor(
    @InjectRepository(Insight)
    private readonly insightRepo: Repository<Insight>,
    private readonly metricsService: MetricsService,
  ) {}

  async generateForCampaign(campaign: Campaign): Promise<Insight[]> {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - this.THRESHOLDS.LOOKBACK_DAYS * 86400000)
      .toISOString().split('T')[0];

    const summary = await this.metricsService.getSummary(from, to, campaign.adAccountId);
    const { averages, totals } = summary;

    const rules: Array<() => InsightPayload | null> = [
      () => this.ruleROASDanger(averages.avgROAS),
      () => this.ruleROASWarning(averages.avgROAS),
      () => this.ruleROASOpportunity(averages.avgROAS),
      () => this.ruleCTRDanger(averages.avgCTR),
      () => this.ruleCTRWarning(averages.avgCTR),
      () => this.ruleCTROpportunity(averages.avgCTR),
      () => this.ruleCPAHigh(averages.avgCPA, campaign.dailyBudget),
      () => this.ruleCPALow(averages.avgCPA, campaign.dailyBudget),
      () => this.ruleOverspend(totals.totalSpend, campaign.dailyBudget),
      () => this.ruleNoConversions(totals.totalSpend, totals.totalConversions),
      () => this.ruleCampaignEndingSoon(campaign.endDate),
      () => this.ruleNoRecentData(summary.byDay),
    ];

    const newInsights: Insight[] = [];

    for (const rule of rules) {
      const payload = rule();
      if (!payload) continue;

      const duplicate = await this.insightRepo.findOne({
        where: {
          campaignId: campaign.id,
          type: payload.type,
          severity: payload.severity,
          resolved: false,
        },
      });
      if (duplicate) continue;

      const insight = this.insightRepo.create({
        campaignId: campaign.id,
        ...payload,
        resolved: false,
      });

      newInsights.push(await this.insightRepo.save(insight));
    }

    if (newInsights.length > 0) {
      this.logger.log(`${newInsights.length} novos insights gerados para campanha ${campaign.id}`);
    }

    return newInsights;
  }

  async resolveInsight(id: string): Promise<Insight> {
    const insight = await this.insightRepo.findOneOrFail({ where: { id } });
    insight.resolved = true;
    return this.insightRepo.save(insight);
  }

  async findAll(filters: {
    campaignId?: string;
    severity?: string;
    resolved?: boolean;
  }): Promise<Insight[]> {
    return this.insightRepo.find({
      where: {
        ...(filters.campaignId && { campaignId: filters.campaignId }),
        ...(filters.severity   && { severity: filters.severity as any }),
        ...(filters.resolved !== undefined && { resolved: filters.resolved }),
      },
      order: { detectedAt: 'DESC' },
    });
  }

  private ruleROASDanger(roas: number): InsightPayload | null {
    if (roas === 0 || roas >= this.THRESHOLDS.ROAS_DANGER) return null;
    return {
      type: 'alert',
      severity: 'danger',
      message: `ROAS de ${roas.toFixed(2)}x: você está perdendo dinheiro nesta campanha`,
      recommendation: 'Pause a campanha e revise o criativo, audiência e landing page antes de reinvestir',
    };
  }

  private ruleROASWarning(roas: number): InsightPayload | null {
    if (roas < this.THRESHOLDS.ROAS_DANGER || roas >= this.THRESHOLDS.ROAS_WARNING) return null;
    return {
      type: 'alert',
      severity: 'warning',
      message: `ROAS de ${roas.toFixed(2)}x: campanha lucrativa mas com margem baixa`,
      recommendation: 'Otimize criativos e segmentação para melhorar o ROAS antes de escalar',
    };
  }

  private ruleROASOpportunity(roas: number): InsightPayload | null {
    if (roas < this.THRESHOLDS.ROAS_OPPORTUNITY) return null;
    return {
      type: 'opportunity',
      severity: 'success',
      message: `ROAS de ${roas.toFixed(2)}x: campanha com excelente retorno`,
      recommendation: 'Considere aumentar o orçamento em 20-30% para escalar os resultados',
    };
  }

  private ruleCTRDanger(ctr: number): InsightPayload | null {
    if (ctr === 0 || ctr >= this.THRESHOLDS.CTR_DANGER) return null;
    return {
      type: 'alert',
      severity: 'danger',
      message: `CTR de ${ctr.toFixed(2)}%: o criativo não está engajando a audiência`,
      recommendation: 'Substitua o criativo imediatamente. Teste novas imagens, vídeos ou textos',
    };
  }

  private ruleCTRWarning(ctr: number): InsightPayload | null {
    if (ctr < this.THRESHOLDS.CTR_DANGER || ctr >= this.THRESHOLDS.CTR_WARNING) return null;
    return {
      type: 'alert',
      severity: 'warning',
      message: `CTR de ${ctr.toFixed(2)}%: abaixo da média do setor (1-2%)`,
      recommendation: 'Teste variações do criativo com A/B testing',
    };
  }

  private ruleCTROpportunity(ctr: number): InsightPayload | null {
    if (ctr < this.THRESHOLDS.CTR_OPPORTUNITY) return null;
    return {
      type: 'opportunity',
      severity: 'success',
      message: `CTR de ${ctr.toFixed(2)}%: criativo performando acima da média`,
      recommendation: 'Use este criativo como base para novas variações. Considere aumentar alcance',
    };
  }

  private ruleCPAHigh(cpa: number, dailyBudget: number): InsightPayload | null {
    if (!dailyBudget || cpa < dailyBudget * this.THRESHOLDS.CPA_HIGH_RATIO) return null;
    return {
      type: 'alert',
      severity: 'warning',
      message: `CPA alto: custo por conversão (R$${cpa.toFixed(2)}) consome mais de 50% do orçamento diário`,
      recommendation: 'Revise o funil de conversão e otimize a landing page para reduzir o CPA',
    };
  }

  private ruleCPALow(cpa: number, dailyBudget: number): InsightPayload | null {
    if (!dailyBudget || cpa === 0 || cpa > dailyBudget * this.THRESHOLDS.CPA_LOW_RATIO) return null;
    return {
      type: 'opportunity',
      severity: 'success',
      message: `CPA eficiente: R$${cpa.toFixed(2)} por conversão (${((cpa / dailyBudget) * 100).toFixed(0)}% do orçamento)`,
      recommendation: 'CPA saudável — seguro para escalar. Aumente o orçamento gradualmente',
    };
  }

  private ruleOverspend(totalSpend: number, dailyBudget: number): InsightPayload | null {
    if (!dailyBudget || totalSpend <= dailyBudget * this.THRESHOLDS.OVERSPEND_RATIO) return null;
    return {
      type: 'alert',
      severity: 'warning',
      message: `Gasto acima do orçamento: R$${totalSpend.toFixed(2)} vs limite de R$${dailyBudget.toFixed(2)}/dia`,
      recommendation: 'Verifique se há duplicação de campanhas ou ajuste o orçamento no Meta Ads Manager',
    };
  }

  private ruleNoConversions(spend: number, conversions: number): InsightPayload | null {
    if (spend < this.THRESHOLDS.MIN_SPEND_NO_CONV || conversions > 0) return null;
    return {
      type: 'alert',
      severity: 'danger',
      message: `R$${spend.toFixed(2)} investidos sem nenhuma conversão nos últimos ${this.THRESHOLDS.LOOKBACK_DAYS} dias`,
      recommendation: 'Pause a campanha e revise: landing page, público-alvo, oferta e pixels de conversão',
    };
  }

  private ruleCampaignEndingSoon(endDate: string): InsightPayload | null {
    if (!endDate) return null;
    const daysLeft = Math.ceil(
      (new Date(endDate).getTime() - Date.now()) / 86400000
    );
    if (daysLeft > this.THRESHOLDS.DAYS_TO_END || daysLeft < 0) return null;
    return {
      type: 'info',
      severity: 'info',
      message: `Campanha encerrando em ${daysLeft} dia(s) (${endDate})`,
      recommendation: 'Decida se vai prorrogar ou encerrar esta campanha. Salve os criativos que performaram bem',
    };
  }

  private ruleNoRecentData(byDay: Array<{ date: string }>): InsightPayload | null {
    if (byDay.length === 0) return null;
    const lastDate = new Date(byDay[byDay.length - 1].date);
    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
    if (daysSince < this.THRESHOLDS.DAYS_NO_DATA) return null;
    return {
      type: 'info',
      severity: 'warning',
      message: `Sem dados de performance há ${daysSince} dias`,
      recommendation: 'Verifique se a campanha está ativa e se o pixel está disparando corretamente',
    };
  }
}
```

---

### `infrastructure/sync.cron.ts` — Sincronização Automática

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CampaignsService } from '../modules/campaigns/campaigns.service';
import { InsightsService } from '../modules/insights/insights.service';

@Injectable()
export class SyncCron {
  private readonly logger = new Logger(SyncCron.name);

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly insightsService: InsightsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async generateInsights() {
    this.logger.log('⏰ Cron iniciado: geração de insights');
    const start = Date.now();

    const campaigns = await this.campaignsService.findAllActive();

    let success = 0;
    let errors = 0;

    for (const campaign of campaigns) {
      try {
        await this.insightsService.generateForCampaign(campaign);
        success++;
      } catch (err) {
        errors++;
        this.logger.error(
          `Erro ao gerar insights para campanha ${campaign.id}: ${err.message}`
        );
      }
    }

    const duration = Date.now() - start;
    this.logger.log(
      `⏰ Cron finalizado em ${duration}ms — ` +
      `${success} ok, ${errors} erros de ${campaigns.length} campanhas`
    );
  }
}
```

---

## 🌐 FRONTEND — ARQUITETURA MODULAR

### `js/api.js` — Camada de Comunicação

```javascript
const BASE_URL = '/api';

async function request(method, endpoint, body = null) {
  const token = localStorage.getItem('accessToken');

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(body && { body: JSON.stringify(body) }),
  };

  let response = await fetch(`${BASE_URL}${endpoint}`, options);

  if (response.status === 401 && token) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      options.headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`;
      response = await fetch(`${BASE_URL}${endpoint}`, options);
    } else {
      clearSession();
      window.location.href = '/auth.html';
      return;
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  if (response.status === 204) return null;

  return response.json();
}

async function tryRefreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const data = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).then(r => r.json());

    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      return true;
    }
  } catch {}

  return false;
}

function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

window.api = {
  login:    (dto) => request('POST', '/auth/login', dto),
  register: (dto) => request('POST', '/auth/register', dto),
  logout:   ()    => { clearSession(); window.location.href = '/auth.html'; },
  getCampaigns: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return request('GET', `/campaigns${params ? '?' + params : ''}`);
  },
  getCampaign:    (id)        => request('GET',    `/campaigns/${id}`),
  createCampaign: (dto)       => request('POST',   `/campaigns`, dto),
  updateCampaign: (id, dto)   => request('PATCH',  `/campaigns/${id}`, dto),
  removeCampaign: (id)        => request('DELETE', `/campaigns/${id}`),
  getMetricsSummary: (from, to) => request('GET', `/metrics/summary?from=${from}&to=${to}`),
  getInsights:     (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return request('GET', `/insights${params ? '?' + params : ''}`);
  },
  resolveInsight:  (id) => request('PATCH', `/insights/${id}/resolve`),
};
```

---

### `js/dashboard.js` — Lógica do Dashboard

```javascript
(function Dashboard() {
  const state = {
    period: { from: daysAgo(30), to: today() },
    campaigns: [],
    metrics: null,
    insights: [],
    loading: false,
  };

  async function init() {
    if (!localStorage.getItem('accessToken')) {
      window.location.href = '/auth.html';
      return;
    }

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('user-name').textContent = user.name || user.email || '';

    setupDatePickers();
    await loadAll();
    setInterval(loadAll, 5 * 60 * 1000);
  }

  async function loadAll() {
    if (state.loading) return;
    state.loading = true;
    showLoading(true);

    try {
      const [metrics, campaigns, insights] = await Promise.all([
        window.api.getMetricsSummary(state.period.from, state.period.to),
        window.api.getCampaigns({ status: 'active' }),
        window.api.getInsights({ resolved: false }),
      ]);

      state.metrics   = metrics;
      state.campaigns = campaigns;
      state.insights  = insights;

      renderKPIs(metrics);
      renderCharts(metrics);
      renderCampaignsTable(campaigns);
      renderInsights(insights);
    } catch (error) {
      showError(`Erro ao carregar dados: ${error.message}`);
    } finally {
      state.loading = false;
      showLoading(false);
    }
  }

  function renderKPIs(metrics) {
    if (!metrics) return;
    const { totals, averages } = metrics;

    setKPI('kpi-spend',      formatCurrency(totals.totalSpend));
    setKPI('kpi-roas',       `${averages.avgROAS.toFixed(2)}x`);
    setKPI('kpi-cpa',        formatCurrency(averages.avgCPA));
    setKPI('kpi-ctr',        `${averages.avgCTR.toFixed(2)}%`);
    setKPI('kpi-conversions', totals.totalConversions.toLocaleString('pt-BR'));

    const roasEl = document.getElementById('kpi-roas');
    if (averages.avgROAS < 1)   roasEl.classList.add('text-danger');
    else if (averages.avgROAS < 2) roasEl.classList.add('text-warning');
    else                           roasEl.classList.add('text-success');
  }

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function daysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
  }

  function setKPI(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  function showError(message) {
    const el = document.getElementById('error-toast');
    if (el) {
      el.textContent = message;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
```

---

## 🔒 SEGURANÇA — CHECKLIST COMPLETO

```
✅ JÁ IMPLEMENTADO:
   - bcrypt (12 rounds) para senhas
   - JWT access token (15min) + refresh token (7d)
   - AES-256 para tokens Meta em repouso
   - Validação de entrada com class-validator (whitelist + forbidNonWhitelisted)
   - CORS configurado por domínio
   - Verificação de .env na inicialização

⚠️  IMPLEMENTAR AGORA (antes de qualquer usuário real):
   - Rate limiting mais granular: /auth/login → 5 req/min por IP
   - Helmet.js para headers HTTP de segurança (X-Frame-Options, CSP, etc.)
   - Refresh token em httpOnly cookie (em vez de localStorage)
   - Query parameter sanitization (SQL injection via TypeORM já está protegido)

🔄  PRÓXIMOS PASSOS (antes de produção):
   - Migrar para PostgreSQL (SQLite não é adequado para produção)
   - Configurar HTTPS com certificado TLS
   - Implementar logging estruturado (Winston/Pino) com sanitização de dados sensíveis
   - Adicionar auditoria: registrar quem fez o quê e quando
   - Revisar LGPD: política de retenção de dados, direito ao esquecimento
```

---

## 🐳 DOCKER — Deploy Local

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./metaiq-backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - ./metaiq-backend/.env
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  frontend:
    build:
      context: ./metaiq-frontend
      dockerfile: Dockerfile
    ports:
      - "4200:4200"
    environment:
      - BACKEND_URL=http://backend:3000
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

---

## 🗺️ ROADMAP TÉCNICO — PRÓXIMOS PASSOS

### Sprint 1 (1-2 semanas): Base sólida

```
☐ Implementar todos os módulos do backend conforme especificado
☐ Conectar frontend com a API real (remover todos os mock data)
☐ Adicionar Helmet.js e rate limiting granular no auth
☐ Configurar refresh token em httpOnly cookie
☐ Escrever testes unitários para InsightsService (12 regras)
☐ Limpar pastas duplicadas e atualizar README
```

### Sprint 2 (3-4 semanas): Integração Meta API

```
☐ Implementar OAuth flow completo com Meta
☐ Criar job de sincronização que busca dados reais
☐ Mapear campos da Meta API para entidades locais
☐ Implementar webhook do Meta para updates em tempo real
☐ Testar com conta sandbox do Meta
```

### Sprint 3 (5-6 semanas): Produto completo

```
☐ Migrar SQLite → PostgreSQL
☐ Implementar multi-tenancy (múltiplas contas por usuário)
☐ Exportação de relatórios (PDF e Excel)
☐ Notificações por email (insights 'danger')
☐ Dashboard de comparação entre períodos (MoM, YoY)
☐ Deploy em produção (Railway, Render ou AWS)
```

### Sprint 4+ (futuro): Escala e IA

```
☐ Integração com Google Ads e TikTok Ads
☐ Modelo de ML para previsão de ROAS nos próximos 7 dias
☐ Recomendações automáticas de orçamento
☐ App mobile (React Native ou Flutter)
☐ API pública para desenvolvedores
☐ Sistema de planos e pagamento (Stripe)
```

---

## 📋 .ENV EXEMPLO COMENTADO

```bash
# ═══════════════════════════════════════════════
# MetaIQ — Variáveis de Ambiente
# ATENÇÃO: Nunca commite o .env real no git!
# Este arquivo (.env.example) serve apenas como template.
# ═══════════════════════════════════════════════

NODE_ENV=development          # development | production | test
PORT=3000                     # Porta do backend
FRONTEND_URL=http://localhost:4200  # URL do frontend (para CORS)

SQLITE_PATH=./data/metaiq.db  # Caminho do arquivo SQLite
# PRÓXIMO PASSO (produção): substituir SQLite por PostgreSQL
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=metaiq
# DB_USER=metaiq_user
# DB_PASS=...senha segura...

JWT_SECRET=...gere_um_valor_unico_de_48_bytes_aqui...
JWT_EXPIRES_IN=15m

JWT_REFRESH_SECRET=...gere_outro_valor_diferente_do_anterior...
JWT_REFRESH_EXPIRES_IN=7d

CRYPTO_SECRET=...32_caracteres_exatos_aqui.......

META_APP_ID=
META_APP_SECRET=
META_API_VERSION=v19.0

# SENDGRID_API_KEY=...
# EMAIL_FROM=noreply@metaiq.dev
```

---

*Documento gerado em Abril/2026 — MetaIQ v2.0*
