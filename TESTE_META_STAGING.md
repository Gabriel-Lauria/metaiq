# TESTE META STAGING

## Objetivo

Validar publicacao real controlada em conta Meta pausada, sem reescrever arquitetura e sem reintroduzir retry automatico em mutacoes.

## Pre-condicoes

- Store conectada na Meta com token valido.
- `pageId` configurado na integracao da store.
- `adAccountId` local mapeado para `externalId` Meta ativo.
- Conta Meta com permissao para criar `campaign`, `adset`, `creative` e `ad`.
- Pixel existente quando o objetivo exigir conversao.
- Campanhas de staging sempre com `initialStatus=PAUSED`.
- Banco com migracao `1776860000000-AddMetaCampaignCreationMetaErrorDetails` aplicada.

## Payload minimo seguro

```json
{
  "name": "STAGING Meta Traffic 2026-05-01 10:00",
  "objective": "OUTCOME_TRAFFIC",
  "dailyBudget": 25,
  "startTime": "2026-05-01T13:00:00.000Z",
  "endTime": "2026-05-08T22:00:00.000Z",
  "country": "BR",
  "ageMin": 25,
  "ageMax": 55,
  "gender": "ALL",
  "adAccountId": "LOCAL-AD-ACCOUNT-ID",
  "message": "Teste controlado de staging Meta",
  "headline": "Oferta staging",
  "description": "Criacao controlada",
  "imageAssetId": "ASSET-ID-VALIDO",
  "destinationUrl": "https://example.com/oferta",
  "cta": "LEARN_MORE",
  "placements": ["feed", "stories"],
  "specialAdCategories": [],
  "initialStatus": "PAUSED",
  "idempotencyKey": "meta-staging-2026-05-01T10-00-00"
}
```

## Sinais esperados por etapa

- `campaign_create_started` seguido de `campaign_create_success`
- `adset_create_started` seguido de `adset_create_success`
- `creative_create_started` seguido de `creative_create_success`
- `ad_create_started` seguido de `ad_create_success`
- `persist_local_started` seguido de `persist_local_success`
- Resposta final com `executionStatus=COMPLETED`
- Registro em `meta_campaign_creations` com:
  - `status=COMPLETED`
  - `metaCampaignId`, `metaAdSetId`, `metaCreativeId`, `metaAdId`
  - `campaignId` local preenchido
  - `metaErrorDetails=null`

## Checklist 1: Criacao completa

1. Enviar payload minimo seguro com `idempotencyKey` novo.
2. Confirmar HTTP 200/201 e capturar `executionId`.
3. Verificar logs por etapa com `executionId`, `idempotencyKey`, `storeId`, `step`, `previousStep`.
4. Confirmar no banco que a execucao terminou como `COMPLETED`.
5. Confirmar na Meta a existencia de `Campaign -> AdSet -> Creative -> Ad`, todos pausados.

## Checklist 2: Idempotencia real

1. Reenviar exatamente o mesmo payload com a mesma `idempotencyKey`.
2. Esperado:
   - nenhum recurso novo na Meta
   - mesma execucao ou mesmo resultado material
   - nenhum `campaign_create_started` novo para outra execucao
3. Alterar um campo do payload mantendo a mesma `idempotencyKey`.
4. Esperado:
   - conflito rejeitado
   - nenhuma mutacao nova na Meta

## Checklist 3: Partial recovery

1. Forcar uma falha apos `campaign` ou `adset` e antes de concluir o fluxo.
2. Confirmar `status=PARTIAL`, `canRetry=true` e `partialIds` preenchidos.
3. Chamar `POST /integrations/meta/stores/:storeId/campaigns/recovery/:executionId/retry`.
4. Esperado:
   - `recovery_started`
   - reuse de `partialIds`
   - nenhum recriacao de `campaign` ja existente
   - `recovery_completed`
   - persistencia local concluida se ainda faltava

## Checklist 4: Rollback

1. Com execucao `PARTIAL`, chamar `POST /integrations/meta/stores/:storeId/campaigns/recovery/:executionId/cleanup`.
2. Esperado:
   - `rollback_started`
   - delecao em ordem reversa: `ad -> creative -> adset -> campaign`
   - `rollback_completed`
   - `status=FAILED`
   - `metaErrorDetails=null`

## Checklist 5: Creative failure

1. Forcar `pageId` invalido ou `destinationUrl` rejeitado no creative.
2. Esperado:
   - `campaign` e `adset` podem existir
   - falha em `creative`
   - `meta_execution_failed`
   - persistencia de `metaErrorDetails` com `code`, `subcode`, `userTitle`, `userMessage`, `fbtraceId`, `step`
   - `partialIds` com `campaignId` e `adSetId`

## Checklist 6: Image failure

1. Testar URL com `content-type` nao imagem.
2. Testar binario invalido com `content-type=image/png`.
3. Testar imagem abaixo de `600x314`.
4. Testar imagem acima de 4MB.
5. Esperado:
   - falha antes de criar `creative`
   - logs `META_IMAGE_DOWNLOAD_INVALID_CONTENT_TYPE`, `META_IMAGE_DOWNLOAD_INVALID_DIMENSIONS` ou `META_IMAGE_DOWNLOAD_TOO_LARGE`
   - nenhum `creative_create_success`

## Mapa exato de falha de imagem

- URL nao direta: bloqueada antes do download.
- URL http(s) invalida: bloqueada antes do download.
- `content-type` fora de `jpeg/png/webp`: bloqueada no download.
- Binario inconsistente com o mime type: bloqueado na leitura de dimensoes.
- Resolucao abaixo de `600x314`: bloqueada antes do upload multipart.
- Arquivo acima de 4MB: bloqueado antes do upload multipart.
- Upload multipart Meta rejeitado: falha em `adimages`, com erro bruto da Meta nos logs.
- `image_hash` ausente na resposta Meta: falha antes do creative.

## Campos de erro que devem ficar persistidos

- `step`
- `message`
- `code`
- `subcode`
- `type`
- `userTitle`
- `userMessage`
- `fbtraceId`

## O que ainda depende de teste real na Meta

- Compatibilidade final entre combinacoes de `objective`, `optimization_goal`, `billing_event` e `promoted_object`
- Restricoes reais da conta de anuncios, pagina, pixel e politica especial
- Rejeicoes especificas da conta por reputacao, limite ou permissao
- Comportamento real de criativo para imagens externas hospedadas fora do fluxo de asset interno
