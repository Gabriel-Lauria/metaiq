# Meta Publisher Staging Checklist

Data base deste checklist: 2026-05-05

Objetivo: provar em ambiente real que o fluxo Meta do MetaIQ fecha `Campaign -> AdSet -> Creative -> Ad -> Retry -> Recovery -> Rollback -> Cleanup` sem sucesso falso e sem órfão silencioso.

## Pré-condições obrigatórias

- App Meta em `LIVE MODE`
- Permissão `ads_management` aprovada e presente no token usado no teste
- Página conectada corretamente na integração da store
- Ad account válida e vinculada ao contexto correto
- Pixel compatível com a ad account quando objetivo exigir conversão/leads
- Asset de imagem válido e utilizável pela Meta
- Website final em `https`
- Logs do backend com `executionId`, `requestId` e `idempotencyKey` preservados

## Registro obrigatório por execução

Registrar e anexar para cada tentativa:

- `requestId`
- `executionId`
- `idempotencyKey`
- `campaignId`
- `adSetId`
- `creativeId`
- `adId`
- status da execução no banco
- status real dos recursos na Meta
- se houve `cleanupPending`
- se houve resource órfão

## Cenário 1: Create normal completo

1. Criar campanha WEBSITE válida.
2. Confirmar preflight aprovado antes do primeiro POST.
3. Confirmar criação em ordem:
   - `Campaign`
   - `AdSet`
   - `Creative`
   - `Ad`
4. Confirmar que todos os recursos nasceram em `PAUSED`.
5. Confirmar `execution.status = COMPLETED`.
6. Confirmar snapshot persistido com:
   - `pageId`
   - `destinationUrl`
   - `imageHash`
   - `metaPayloadSnapshot`

Critério de aprovação:

- nenhum POST fora de ordem
- nenhum `fallback` implícito
- nenhum status diferente de `PAUSED`

## Cenário 2: Falha controlada no creative

1. Forçar falha real ou controlada no passo `creative`.
2. Confirmar `execution.status = PARTIAL`.
3. Confirmar IDs já criados persistidos em `partialIds`.
4. Confirmar `metaErrorDetails` com `code`, `subcode`, `fbtraceId`, `hint`.

Critério de aprovação:

- sistema acusa falha no passo correto
- nenhuma mensagem de sucesso parcial

## Cenário 3: Retry usando snapshot

1. Rodar retry da execução parcial.
2. Alterar metadata atual da integração entre a falha e o retry para tentar contaminar o replay.
3. Confirmar que retry usa snapshot persistido, não metadata atual.

Validar explicitamente:

- `pageId` do snapshot
- `destinationUrl` do snapshot
- `imageHash` do snapshot

Critério de aprovação:

- payload retomado não deriva da configuração atual da store

## Cenário 4: Recovery completo

1. Retomar execução parcial até completar `Creative` e `Ad`.
2. Confirmar `execution.status = COMPLETED`.
3. Confirmar `Campaign`, `AdSet`, `Creative` e `Ad` válidos na Meta.

Critério de aprovação:

- recovery reentra exatamente do passo faltante
- não recria recurso já existente

## Cenário 5: Rollback total bem-sucedido

1. Criar uma execução parcial ou completa controlada para limpeza.
2. Rodar cleanup.
3. Confirmar deleção em ordem inversa:
   - `Ad`
   - `Creative`
   - `AdSet`
   - `Campaign`
4. Confirmar `cleanupPending = false`.
5. Confirmar ausência total dos recursos na Meta.

Critério de aprovação:

- API retorna sucesso
- nenhum órfão remanescente

## Cenário 6: Rollback com falha honesta

1. Simular falha real ou bloqueio de deleção em um dos recursos.
2. Rodar cleanup.
3. Confirmar:
   - `PARTIAL_ROLLBACK` quando houve limpeza parcial
   - `CLEANUP_FAILED` quando nada foi limpo
   - `cleanupPending = true`
   - resposta HTTP de erro
   - IDs órfãos preservados no payload/log

Critério de aprovação:

- sistema nunca retorna "limpeza concluída" com recurso órfão restante

## Cenário 7: Idempotent replay

1. Repetir a mesma criação com a mesma `idempotencyKey`.
2. Confirmar que não duplica `Campaign`, `AdSet`, `Creative` ou `Ad`.
3. Confirmar resposta coerente com o estado da execução original.

Critério de aprovação:

- zero duplicação de recurso na Meta

## Resultado final

Liberar cliente pagante somente se todos os cenários acima forem aprovados e documentados com evidência real da Meta.
