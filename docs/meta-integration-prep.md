# Fase 7.8 - Preparacao para Integracao Meta Ads

## Objetivo

Esta fase prepara o MetaIQ para receber a integracao real com Meta Ads na Fase 8, sem executar OAuth real, sem chamar APIs externas e sem importar dados reais.

O principio central adotado foi: integracao pertence a Store, nao ao User.

## Modelo criado

Foi criada a entidade `StoreIntegration`, persistida na tabela `store_integrations`.

Campos principais:

- `storeId`: store dona da integracao.
- `provider`: provider externo. Nesta fase, apenas `META`.
- `status`: estado atual da conexao.
- `externalBusinessId`: identificador externo do Business Manager, quando aplicavel.
- `externalAdAccountId`: conta externa escolhida, quando aplicavel.
- `accessToken` e `refreshToken`: campos preparados com `CryptoTransformer` e `select: false`.
- `tokenExpiresAt`: expiracao futura do token.
- `lastSyncAt`: ultima tentativa de sync.
- `lastSyncStatus`: status da ultima sincronizacao.
- `lastSyncError`: erro controlado da ultima sincronizacao.
- `metadata`: metadados auxiliares do provider.
- `createdAt` e `updatedAt`.

Constraint relevante:

- `UNIQUE (storeId, provider)`: uma conexao por provider em cada store.

## Estados definidos

Estados da conexao:

- `NOT_CONNECTED`
- `CONNECTING`
- `CONNECTED`
- `ERROR`
- `EXPIRED`
- `DISCONNECTED`

Estados de sincronizacao:

- `NEVER_SYNCED`
- `PENDING`
- `SYNCING`
- `SUCCESS`
- `ERROR`

## AdAccount preparada para origem externa

A entidade `AdAccount` foi preparada com campos de origem externa:

- `provider`
- `externalId`
- `syncStatus`
- `importedAt`
- `lastSeenAt`

O campo legado `metaId` foi mantido para compatibilidade.

## Endpoints criados

Base:

`/api/integrations/meta/stores/:storeId`

Endpoints:

- `GET /status`: retorna/cria status controlado da integracao para a store.
- `GET /sync-plan`: retorna o plano interno de sincronizacao previsto para Fase 8.
- `POST /connect`: registra conexao simulada/preparada.
- `PATCH /status`: atualiza status interno da conexao.
- `DELETE /`: desconecta a integracao e limpa tokens.

Nenhum endpoint chama a API real da Meta.

## Regras de seguranca

- `ADMIN` e `MANAGER` podem gerenciar integracao.
- `OPERATIONAL` e `CLIENT` nao podem conectar, desconectar ou atualizar status.
- `GET /status` fica visivel para roles com acesso a store, mas sempre validando escopo.
- Toda operacao valida `storeId` via `AccessScopeService.validateStoreAccess`.
- Manager so gerencia stores do proprio tenant.
- Tokens sao criptografados no banco e nao retornam por padrao.

## Fluxo planejado para Fase 8

Contrato interno preparado pelo `MetaSyncPlan`:

1. `VALIDATE_STORE_CONNECTION`
2. `FETCH_EXTERNAL_AD_ACCOUNTS`
3. `UPSERT_AD_ACCOUNTS`
4. `UPSERT_CAMPAIGNS`
5. `UPSERT_METRICS`
6. `RECORD_SYNC_RESULT`

Na Fase 8, o fluxo real deve adicionar:

- OAuth Meta real.
- Callback seguro.
- Troca de code por token.
- Refresh token/renovacao quando aplicavel.
- Busca real de Business/Ad Accounts.
- Importacao idempotente de campaigns.
- Importacao incremental de metrics.
- Registro consistente de erros e `lastSyncStatus`.

## Frontend

Foi criada a tela `/manager/integrations`.

Ela permite:

- listar stores do escopo do ADMIN/MANAGER;
- visualizar status Meta por store;
- simular conexao;
- desconectar;
- marcar token como expirado;
- visualizar campos planejados de Business ID e Ad Account externo.

O texto deixa claro que OAuth real ainda nao foi ativado.

## Pendencias para Fase 8

- Implementar OAuth real da Meta.
- Validar scopes/permissoes exigidos pela Meta.
- Implementar callback e state anti-CSRF.
- Implementar refresh/expiracao de token.
- Buscar Business/Ad Accounts reais.
- Fazer upsert real de AdAccounts/Campaigns/Metrics.
- Definir estrategia de rate limit e retries para a Meta API.
- Ajustar jobs de sync real sem sobrecarregar o banco.
