# Meta OAuth por Store

## Objetivo

A Fase 8.1 habilita a conexao real de uma Store com Meta Ads via OAuth. Esta fase nao importa campanhas, metricas ou insights reais. O unico resultado esperado e persistir uma conexao segura em `store_integrations`.

## Modelo

### `store_integrations`

A conexao continua vinculada a `storeId` e `provider = META`.

Campos sensiveis:

- `accessToken`
- `refreshToken`

Esses campos usam `select: false` e transformer de criptografia. Eles nunca devem sair em respostas HTTP.

Campos adicionados para OAuth:

- `tokenType`
- `grantedScopes`
- `providerUserId`
- `oauthConnectedAt`

### `oauth_states`

Tabela criada para proteger o callback OAuth contra CSRF e replay.

Campos principais:

- `provider`
- `state`
- `storeId`
- `initiatedByUserId`
- `expiresAt`
- `usedAt`
- `createdAt`

Regras:

- `state` e gerado com bytes aleatorios seguros.
- Expira em 10 minutos.
- So pode ser usado uma vez.
- O consumo do `state` e atomico: `UPDATE ... WHERE usedAt IS NULL AND expiresAt > now()`.
- Ao iniciar um novo OAuth para a mesma Store/provider, states pendentes anteriores sao inutilizados.
- O callback nunca recebe `storeId` do frontend; ele resolve a Store pelo `state`.

## Endpoints

### Start

`GET /api/integrations/meta/stores/:storeId/oauth/start`

Roles:

- `ADMIN`
- `MANAGER`

Fluxo:

1. Valida acesso a Store pelo escopo do usuario.
2. Gera e persiste `state`.
3. Marca a integracao como `CONNECTING`.
4. Retorna `authorizationUrl` da Meta.

### Callback

`GET /api/integrations/meta/oauth/callback`

Fluxo:

1. Recebe `code` e `state` da Meta.
2. Valida existencia, expiracao e uso previo do `state`.
3. Marca o `state` como usado.
4. Troca `code` por token no backend.
5. Persiste token na `StoreIntegration`.
6. Marca a integracao como `CONNECTED`.
7. Redireciona para o frontend em `/manager/integrations`.

Em caso de erro, a integracao e marcada como `ERROR` quando ha Store associada ao state.

## Variaveis de Ambiente

```env
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3004/api/integrations/meta/oauth/callback
META_API_VERSION=v19.0
META_OAUTH_SCOPES=ads_read,business_management
AUTH_ENABLE_DEV_META_CONNECT=false
```

`META_APP_SECRET` fica apenas no backend.

## Resposta Sanitizada

Os endpoints de status retornam DTO seguro com:

- `id`
- `storeId`
- `provider`
- `status`
- `externalBusinessId`
- `externalAdAccountId`
- `tokenType`
- `tokenExpiresAt`
- `grantedScopes`
- `providerUserId`
- `oauthConnectedAt`
- `lastSyncAt`
- `lastSyncStatus`
- `lastSyncError`
- `createdAt`
- `updatedAt`

Nao retorna:

- `accessToken`
- `refreshToken`
- `metadata`
- segredo de app

## Frontend

A tela `/manager/integrations` chama o endpoint de start, recebe a URL de autorizacao e redireciona o usuario para a Meta.

Depois do callback, o backend redireciona para:

```text
/manager/integrations?metaOAuth=success|error&message=...&storeId=...
```

O frontend mostra feedback amigavel e recarrega os status.

## Hardening

- `OPERATIONAL` e `CLIENT` nao iniciam OAuth.
- `ADMIN` e `MANAGER` precisam passar pelo escopo da Store.
- Callback nao aceita `storeId` vindo do cliente.
- Fluxo manual `POST /connect` fica bloqueado por padrao e so funciona quando `AUTH_ENABLE_DEV_META_CONNECT=true` fora de producao.
- `PATCH /status` tambem fica bloqueado por padrao para evitar manipulacao operacional de status sensivel.
- Em `NODE_ENV=production`, os endpoints manuais falham mesmo se a flag dev for ligada por engano.

## Fase 8.2

Proximos passos:

- Trocar token curto por long-lived token, se aplicavel ao app Meta.
- Buscar Business/Ad Accounts reais.
- Mapear AdAccounts externas para `ad_accounts`.
- Importar campaigns por Store.
- Planejar sync incremental e auditoria de sync.
