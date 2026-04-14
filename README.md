# MetaIQ

Plataforma para acompanhar campanhas de Meta Ads com backend NestJS, banco via TypeORM e frontend Angular.

## Estrutura

```text
metaiq/
├── metaiq-backend/   # NestJS API
├── metaiq-frontend/  # Angular app
└── docs/             # Documentação de arquitetura
```

## Execução Local

Backend:

```bash
cd metaiq-backend
npm install
copy .env.example .env
npm run seed
npm run start:dev
```

API local:

```text
http://localhost:3004/api
```

Frontend:

```bash
cd metaiq-frontend
npm install
npm start
```

App local:

```text
http://localhost:4200
```

Usuário demo criado pelo seed:

```text
Email: demo@metaiq.dev
Senha: Demo@1234
```

## Validação

Backend:

```bash
cd metaiq-backend
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

Frontend:

```bash
cd metaiq-frontend
npm run build
```

## Produção

O backend usa migrations em produção. Configure:

```env
NODE_ENV=production
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=false
JWT_SECRET=long-random-secret
JWT_REFRESH_SECRET=another-long-random-secret
CRYPTO_SECRET=another-long-random-secret
```

Depois rode:

```bash
cd metaiq-backend
npm run build
npm run migration:run
npm run start:prod
```

Veja [metaiq-backend/README.md](./metaiq-backend/README.md) para variáveis, migrations e API.
