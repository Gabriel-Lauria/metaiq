# Fase 7.5.3 - Validacao Final em PostgreSQL Real

Data: 2026-04-15

## Ambiente validado

- Sistema operacional: Windows local.
- Backend: NestJS compilado e executado via `node dist/main.js`.
- Banco: PostgreSQL real em `localhost:5432`.
- Versao detectada: PostgreSQL 16.10, 64-bit.
- Banco usado: `metaiq`.
- Usuario usado: usuario configurado no `.env` local do backend.
- Docker/psql: nao estavam disponiveis no PATH; a validacao usou o PostgreSQL local ja instalado e o driver `pg`.

## Preparacao do banco

Foi encontrado um estado parcial antigo no banco local:

- A tabela `migrations` existia, mas sem registros.
- Algumas tabelas antigas tambem existiam.
- A migration inicial usava `CREATE TABLE IF NOT EXISTS`; por isso, uma tabela antiga `ad_accounts` sem `metaId` fez o indice `IDX_ad_accounts_metaId` falhar.

Correcao aplicada no ambiente local:

- Reset controlado das tabelas do schema `public` com `DROP TABLE ... CASCADE`.
- Nao foi possivel dropar o schema `public` porque o usuario local nao era dono do schema.

## Migrations

Com o banco limpo, `npm run migration:run` rodou com sucesso no PostgreSQL real.

Migrations registradas diretamente na tabela `migrations`:

- `InitialSchema1776170000000`
- `AddUserRole1776260000000`
- `CreateManagersStoresUserStores1776270000000`
- `AddUserManager1776271000000`
- `AddAdAccountStore1776272000000`
- `AddCampaignStore1776273000000`
- `AddPostgresRelationalIntegrity1776274000000`

Tambem foram validadas as FKs incrementais:

- `FK_users_managerId`
- `FK_ad_accounts_storeId`
- `FK_campaigns_storeId`
- `FK_campaigns_createdByUserId`

Observacao: `npm run migration:show` exibiu `[ ]` mesmo apos as migrations estarem persistidas. A confirmacao final foi feita por consulta direta na tabela `migrations`.

## Seed

`npm run seed` rodou com sucesso no PostgreSQL real usando o datasource oficial.

Dados criados:

- Admin `admin@metaiq.dev`
- Usuario demo `demo@metaiq.dev`
- Manager demo
- Store demo
- Vinculo UserStore
- AdAccount demo
- 5 campanhas demo
- 30 dias de metrics por campanha

## Backend real

O backend foi iniciado com:

```bash
npm run build
node dist/main.js
```

Healthcheck validado:

```json
{
  "status": "ok",
  "db": "postgresql"
}
```

## Fluxos HTTP validados no PostgreSQL

Com backend conectado ao PostgreSQL real, foram validados via HTTP:

- `POST /api/auth/login` com usuario valido.
- `POST /api/auth/login` com credenciais invalidas retornando erro.
- `POST /api/auth/refresh`.
- `GET /api/users/me`.
- `POST /api/managers`.
- `POST /api/stores`.
- `PATCH /api/stores/:id`.
- `POST /api/users`.
- `POST /api/stores/:storeId/users/:userId`.
- `GET /api/stores/accessible`.
- `GET /api/campaigns`.
- `GET /api/metrics`.
- `GET /api/metrics/summary`.
- `GET /api/insights`.
- `GET /api/dashboard/summary`.

Os dados temporarios criados nessa validacao foram removidos ao final por query direta no PostgreSQL.

## Correcoes aplicadas durante a validacao

- `DashboardService.getRecentInsights()` quebrava no PostgreSQL/TypeORM com:
  - `"CASE insight" alias was not found`
- A ordenacao por severidade foi corrigida para usar `addSelect(..., 'severityRank')` e `orderBy('severityRank', 'ASC')`.

## Suite e2e

A suite e2e foi atualizada para o modelo atual do produto:

- Nao usa mais registro publico.
- Cria usuarios diretamente com roles:
  - ADMIN
  - MANAGER
  - OPERATIONAL
  - CLIENT
- Cria dois tenants com Manager e Store.
- Cria vinculos UserStore.
- Usa `storeId` em AdAccount e Campaign.
- Valida scoping por store/tenant.
- Valida dashboard, campaigns, ad-accounts, metrics e insights.
- Valida FK invalida no banco.

Resultado em PostgreSQL real:

```text
Test Suites: 1 passed, 1 total
Tests: 6 passed, 6 total
```

Comando usado:

```powershell
$env:E2E_DB_TYPE='postgres'; npm run test:e2e
```

## Builds e testes finais

- Backend build: passou.
- Backend tests: passou, 3 suites e 22 testes.
- E2E em PostgreSQL real: passou, 1 suite e 6 testes.
- Frontend build: passou com warning conhecido de budget inicial acima de 500 kB.

## Frontend

Nao houve redesign nem alteracao de UI nesta fase. O frontend foi validado por build e os endpoints consumidos por ele foram exercitados contra o backend conectado ao PostgreSQL real.

## Artefatos SQLite

Arquivos SQLite rastreados removidos do workspace:

- `metaiq-backend/data/metaiq-copy.db`
- `metaiq-backend/data/metaiq.db`
- `metaiq-backend/data/metaiq.db-journal`

Decisao:

- Esses arquivos sao artefatos locais de SQLite e nao devem continuar versionados agora que PostgreSQL e o caminho principal.
- `.gitignore` ja bloqueia novos `.db`, `.sqlite*` e `metaiq-backend/data/`.

## Pendencias

- Instalar Docker ou adicionar ferramentas PostgreSQL (`psql`, `pg_isready`) ao PATH para operacao manual mais confortavel.
- Investigar por que `migration:show` mostra `[ ]` mesmo com registros na tabela `migrations`.
- Fazer validacao visual em navegador apos a proxima fase de UI/UX.

## Veredito

PRONTO PARA FASE 7.6 COM RESSALVAS.

O backend, migrations, seed, e2e e fluxos principais foram validados em PostgreSQL real. A ressalva restante e operacional: Docker/psql nao estavam disponiveis neste ambiente, e a validacao visual completa do frontend em navegador fica para a proxima fase.
