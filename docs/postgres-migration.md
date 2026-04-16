# Fase 7.5.2 - Migracao para PostgreSQL

Data: 2026-04-15

## Objetivo

Tornar PostgreSQL o caminho principal de desenvolvimento local do backend MetaIQ, mantendo SQLite apenas como fallback legado/testes e sem remover `userId` legado.

## O que foi revisado

- Configuracao TypeORM em `src/data-source.ts`, `src/config/database.config.ts` e `src/app.module.ts`.
- Migrations existentes de schema inicial, roles, managers, stores, user_stores, ad_accounts e campaigns.
- Entities com foco em UUID, booleans, datas, decimals, enums, indices e relacionamentos.
- Seed de demonstracao.
- Queries criticas em auth, users, managers, stores, campaigns, ad-accounts, metrics, insights e dashboard.
- Testes backend e e2e para acoplamento implicito a SQLite.
- Artefatos locais SQLite no repositorio.

## Incompatibilidades encontradas

- O caminho padrao ainda era SQLite (`DATABASE_TYPE=sqlite`) em config e documentacao.
- O seed instanciava `DataSource` SQLite diretamente e importava migrations manualmente.
- Variaveis de ambiente usavam nomes mistos (`DATABASE_TYPE`, `POSTGRES_*`) em vez de um contrato principal `DB_*`.
- `TYPEORM_SYNCHRONIZE` podia ficar ativo por default em development, o que e perigoso para PostgreSQL.
- Colunas adicionadas na transicao multi-tenant nao tinham FKs incrementais em PostgreSQL:
  - `users.managerId`
  - `ad_accounts.storeId`
  - `campaigns.storeId`
  - `campaigns.createdByUserId`
- Teste e2e importava `AppModule` antes de setar ambiente de teste, entao podia abrir conexao usando `.env`.
- `OwnershipGuard` injetava repositorios por entidade, o que falhava em modulos que usavam o guard mas nao tinham todos esses repositories no contexto.
- Arquivos `.db` locais estavam rastreados pelo Git e novos artefatos SQLite nao eram ignorados.

## Correcoes aplicadas

- PostgreSQL virou default em `database.config.ts` e `data-source.ts`.
- Adicionados aliases principais:
  - `DB_TYPE`
  - `DB_HOST`
  - `DB_PORT`
  - `DB_NAME`
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_SSL`
  - `DB_URL`
- Mantidos aliases legados para compatibilidade:
  - `DATABASE_TYPE`
  - `DATABASE_URL`
  - `POSTGRES_*`
  - `SQLITE_PATH`
- `TYPEORM_SYNCHRONIZE` agora tem default `false`.
- Seed passou a usar o datasource oficial (`src/data-source.ts`) e `runMigrations()`.
- Criado `docker-compose.yml` com PostgreSQL 16 local.
- Criada migration `1776274000000-AddPostgresRelationalIntegrity.ts` para FKs incrementais em PostgreSQL.
- `OwnershipGuard` passou a resolver repositories via `DataSource`, evitando problema de DI entre modulos.
- `.gitignore` passou a ignorar `*.db`, `*.sqlite*` e `metaiq-backend/data/`.
- Teste e2e passou a definir ambiente SQLite antes do import dinamico de `AppModule`.

## Setup local com Docker

Na raiz do repositorio:

```bash
docker compose up -d postgres
```

Parar o banco:

```bash
docker compose stop postgres
```

Derrubar containers sem apagar dados:

```bash
docker compose down
```

Resetar banco local:

```bash
docker compose down -v
docker compose up -d postgres
```

Credenciais locais:

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=metaiq
DB_USER=metaiq
DB_PASSWORD=metaiq
DB_SSL=false
```

## Configurar .env

No backend:

```bash
cd metaiq-backend
copy .env.example .env
```

Valores minimos:

```env
NODE_ENV=development
PORT=3004
FRONTEND_URL=http://localhost:4200

DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=metaiq
DB_USER=metaiq
DB_PASSWORD=metaiq
DB_SSL=false

TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=false

JWT_SECRET=replace-with-a-local-secret
JWT_REFRESH_SECRET=replace-with-a-different-local-secret
CRYPTO_SECRET=replace-with-a-local-crypto-secret
```

## Rodar migrations

```bash
cd metaiq-backend
npm run migration:show
npm run migration:run
```

Em banco limpo, as migrations esperadas sao:

```text
InitialSchema1776170000000
AddUserRole1776260000000
CreateManagersStoresUserStores1776270000000
AddUserManager1776271000000
AddAdAccountStore1776272000000
AddCampaignStore1776273000000
AddPostgresRelationalIntegrity1776274000000
```

## Rodar seed

```bash
cd metaiq-backend
npm run seed
```

O seed deve criar:

- admin `admin@metaiq.dev / Admin@1234`
- usuario demo `demo@metaiq.dev / Demo@1234`
- Manager demo
- Store demo
- vinculo UserStore
- AdAccount demo
- campanhas demo
- metricas de 30 dias

## Validacao de integridade relacional

PostgreSQL passa a ter FKs para:

- `ad_accounts.userId -> users.id`
- `campaigns.userId -> users.id`
- `campaigns.adAccountId -> ad_accounts.id`
- `metrics_daily.campaignId -> campaigns.id`
- `insights.campaignId -> campaigns.id`
- `stores.managerId -> managers.id`
- `user_stores.userId -> users.id`
- `user_stores.storeId -> stores.id`
- `users.managerId -> managers.id`
- `ad_accounts.storeId -> stores.id`
- `campaigns.storeId -> stores.id`
- `campaigns.createdByUserId -> users.id`

`userId` legado foi mantido de proposito para compatibilidade do fluxo atual.

## Validacao executada nesta fase

- `npm run build` no backend: passou.
- `npm test -- --runInBand` no backend: passou, 3 suites e 22 testes.
- `npm run build` no frontend: passou com warning de budget inicial acima de 500 kB.
- `npm run migration:run` em SQLite smoke: passou com as 7 migrations.
- `npm run seed` em SQLite smoke usando o datasource oficial: passou.
- Tentativa de `npm run migration:run` em PostgreSQL local `localhost:5432` com credenciais `metaiq/metaiq`: bloqueada por autenticacao (`28P01`).
- `docker` e `psql` nao estavam disponiveis no PATH deste ambiente.

## Estado dos testes

- Suite unit/integration configurada em `npm test` permanece previsivel e passou.
- E2E ainda precisa ser atualizado para o modelo operacional completo por store. Ele ja foi ajustado para nao importar `AppModule` antes do ambiente de teste, mas ainda usa fluxo legado de registro publico e AdAccount sem `storeId`.

## Diferencas entre SQLite antigo e PostgreSQL novo

- PostgreSQL e mais estrito com tipos UUID, FKs e constraints.
- `synchronize` fica desligado por default; schema deve evoluir por migrations.
- Booleans usam `true/false`, nao `0/1`.
- Datas usam `timestamp`/`date` conforme migrations.
- UUIDs sao gerados por `gen_random_uuid()` via extensao `pgcrypto`.
- Novos artefatos SQLite locais nao devem ser versionados.

## Pendencias

- Executar migrations e seed em um PostgreSQL local com as credenciais do `docker-compose.yml` apos instalar Docker ou ajustar o Postgres local existente.
- Atualizar a suite e2e para criar Manager/Store/UserStore antes de AdAccount/Campaign.
- Remover do versionamento, em uma mudanca separada e combinada com o time, os arquivos SQLite ja rastreados em `metaiq-backend/data/`.
- Validar manualmente login, dashboard, campaigns, stores e users em navegador com backend conectado ao Postgres.

## Atualizacao - Fase 7.5.3

A validacao em PostgreSQL real foi concluida posteriormente. Veja `docs/postgres-validation.md`.
