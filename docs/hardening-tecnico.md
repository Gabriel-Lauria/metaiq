# Fase 7.5.1 - Hardening Tecnico

Data: 2026-04-15

## Problemas encontrados

- `OwnershipGuard` inferia o tipo de recurso por `request.path.split('/')`, criando dependencia fragil do formato da rota.
- O guard antigo validava ownership por `userId` direto e nao pelo escopo multi-tenant/store centralizado.
- Endpoints sensiveis ja tinham validacao nos services, mas nao declaravam explicitamente o recurso protegido no nivel do handler.
- `GET /users/me` usava metodo com nome `UnsafeInternal`, apesar de consultar o proprio usuario autenticado.
- `ManagersService.findAll()` nao recebia contexto. O controller era `ADMIN`, mas o contrato do service nao deixava isso explicito.
- Agregacoes de campanha em metrics selecionavam `AVG(m.ctr)`, `AVG(m.cpa)` e `AVG(m.roas)`, o que poderia levar a media simples de metricas diarias em vez do calculo ponderado por totais.
- Frontend persistia `role` duplicado em `localStorage`, alem do objeto `user`.
- Enquanto nao ha integracao Meta, dashboard/campaigns poderiam ser interpretados como dados reais.

## Correcoes aplicadas

- Criado decorator `@CheckOwnership(resource, paramName?)` para declarar explicitamente o recurso protegido.
- `OwnershipGuard` passou a usar `Reflector` e metadata, sem parsing de URL.
- `OwnershipGuard` agora valida acesso com `AccessScopeService`:
  - `campaign` via Campaign -> Store -> Manager, com fallback legado de owner.
  - `adAccount` via AdAccount -> Store -> Manager, com fallback legado de owner.
  - `insight` via Insight -> Campaign -> Store -> Manager.
- Aplicado `@CheckOwnership` nos endpoints por ID de:
  - campaigns
  - ad-accounts
  - insights
  - metrics por campanha
- `GET /users/me` passou a usar `findAuthenticatedProfile(requester)`.
- `ManagersService.findAll()` foi trocado por `findAllForUser(requester)`, com `findAllUnsafeInternal()` isolado para uso interno e validacao ADMIN explicita.
- Agregacoes de metrics passaram a calcular CTR/CPC/CPA/ROAS a partir dos totais agregados.
- Removida persistencia duplicada de `role` no frontend; o papel passa a ser derivado de `user`.
- Adicionados indicadores de "Dados de demonstracao" no dashboard e em campaigns.
- Corrigido CSS legado `status-ended` para `status-archived`.

## Decisoes de seguranca

- Falha fechada no `OwnershipGuard`: usar o guard sem metadata agora retorna `ForbiddenException`.
- Endpoints continuam validando escopo tambem nos services. O guard adiciona uma camada declarativa, mas a autorizacao de dados permanece nos services.
- Para recursos fora do escopo, o guard retorna `NotFoundException`, reduzindo enumeracao de IDs entre tenants.
- Agregacoes de metrics usam uma unica fonte de verdade: `common/utils/metrics.util.ts`.
- Formula padrao:
  - CTR = clicks / impressions * 100
  - CPC = spend / clicks
  - CPA = spend / conversions
  - ROAS = revenue / spend
- Nunca usar media simples de CTR/CPA/ROAS diarios para total do periodo.

## Auth e tokens

Estado atual:

- `accessToken` ainda e persistido em `localStorage`.
- `refreshToken` ainda e enviado no body de `/auth/refresh` e persistido em `localStorage`.
- `role` duplicado foi removido do `localStorage`.

Plano de migracao recomendado:

- Refresh token em cookie `httpOnly`, `Secure`, `SameSite=Lax` ou `Strict`.
- Access token somente em memoria no Angular.
- `/auth/refresh` deve ler cookie e rotacionar refresh token.
- Frontend deve usar `withCredentials` para refresh/login e manter interceptor lendo access token apenas do estado em memoria.

## Pontos pendentes

- Migrar refresh token para cookie httpOnly exige ajuste coordenado de backend e frontend.
- Validacao manual por role/tenant deve ser repetida com dados reais antes da migracao PostgreSQL.
- `metaiq-backend/data/*.db` continua sendo artefato local SQLite; nao e parte da estrategia de producao.
- O build frontend segue acima do budget inicial configurado em 54.06 kB; nao foi tratado nesta fase por nao ser hardening de seguranca.

## Validacao executada

- Backend build: `npm run build` em `metaiq-backend`.
- Backend tests: `npm test -- --runInBand` em `metaiq-backend`.
- Frontend build: `npm run build` em `metaiq-frontend`.
- Busca por parsing fragil de URL no backend: sem ocorrencias de `request.path`, `req.path`, `.path.split` ou `split('/')` em `src`.
- Busca por medias simples de metricas agregadas: sem `AVG(m.ctr)`, `AVG(m.cpa)` ou `AVG(m.roas)` em `src`.

## Veredito

PRONTO COM RESSALVAS.

O isolamento por tenant/store esta centralizado e reforcado nos endpoints revisados. A ressalva principal e a estrategia atual de token no frontend, que ainda depende de `localStorage` para access/refresh token ate a migracao planejada para cookie httpOnly e access token em memoria.
