# MetaIQ Backend

NestJS API for MetaIQ with JWT auth, TypeORM, and PostgreSQL as the primary local development database. SQLite remains available only as a legacy/test fallback.

## Quick Start

```bash
npm install
copy .env.example .env
docker compose up -d postgres
npm run migration:run
npm run seed
npm run start:dev
```

Default API URL:

```text
http://localhost:3004/api
```

Demo user created by `npm run seed`:

```text
Email: demo@metaiq.dev
Senha: Demo@1234
```

## Environment

Copy [.env.example](./.env.example) to `.env` and replace all secrets.

Required in production:

```env
NODE_ENV=production
PORT=3004
FRONTEND_URL=https://your-frontend.example

JWT_SECRET=long-random-secret
JWT_REFRESH_SECRET=another-long-random-secret
CRYPTO_SECRET=another-long-random-secret
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The app intentionally refuses to boot in production if `JWT_SECRET`, `JWT_REFRESH_SECRET`, or `CRYPTO_SECRET` are left as defaults.

## Database

Local PostgreSQL:

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=metaiq
DB_USER=metaiq
DB_PASSWORD=metaiq
DB_SSL=false
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=false
```

URL form:

```env
DB_URL=postgres://user:password@host:5432/metaiq
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=false
```

Legacy SQLite fallback:

```env
DB_TYPE=sqlite
SQLITE_PATH=./data/metaiq.db
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=false
```

Run migrations manually before starting production:

```bash
npm run migration:run
npm run start:prod
```

Or allow the app to run pending migrations on boot:

```env
TYPEORM_MIGRATIONS_RUN=true
```

Prefer manual migrations for controlled production deploys.

## Scripts

```bash
npm run start:dev       # development server
npm run build           # compile TypeScript
npm run start:prod      # run dist/main.js
npm run seed            # run migrations and seed demo data
npm test -- --runInBand # unit tests
npm run test:e2e -- --runInBand
npm run lint
```

Migration scripts:

```bash
npm run migration:show
npm run migration:run
npm run migration:revert
npm run migration:generate -- src/migrations/MeaningfulName
```

## Security Notes

- Every user-facing data route must filter by authenticated `userId` directly or through a campaign ownership join.
- Meta `accessToken` is encrypted at rest and excluded from default selects.
- CORS uses an allowlist from `FRONTEND_URL` plus local development origins.
- `/api/meta/*` operational endpoints require JWT.
- `synchronize` must stay disabled in production.

## Current API Surface

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh

GET    /api/users/me
PATCH  /api/users/me
DELETE /api/users/me

GET    /api/ad-accounts
GET    /api/ad-accounts/:id
POST   /api/ad-accounts
PATCH  /api/ad-accounts/:id
DELETE /api/ad-accounts/:id

GET /api/campaigns
GET /api/campaigns/:id

GET /api/metrics
GET /api/metrics/summary
GET /api/metrics/campaigns/:campaignId
GET /api/metrics/campaigns/:campaignId/aggregate

GET   /api/insights
GET   /api/insights/:id
PATCH /api/insights/:id/resolve

GET  /api/meta/status
POST /api/meta/sync
```
