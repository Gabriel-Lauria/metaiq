# Platform Admin, Empresas e Exclusão Segura

## Usuário master da plataforma

O usuário master usa a role interna `PLATFORM_ADMIN` e não pertence a nenhuma empresa:

- `tenantId = null`
- `managerId = null`
- `active = true`
- `deletedAt = null`

Ele é criado ou atualizado pelo seed oficial do backend (`npm run seed`) a partir de variáveis de ambiente. O código não possui senha fixa para esse usuário.

Variáveis necessárias:

```env
PLATFORM_ADMIN_EMAIL=admin.platform@example.com
PLATFORM_ADMIN_PASSWORD=use-uma-senha-forte-com-12-ou-mais-caracteres
PLATFORM_ADMIN_NAME=Administrador da Plataforma
```

Regras do seed:

- Se `PLATFORM_ADMIN_EMAIL` e `PLATFORM_ADMIN_PASSWORD` não estiverem definidos, o seed não cria o master e registra aviso.
- Se o e-mail não existir, cria o usuário com senha hasheada.
- Se o e-mail já existir como `PLATFORM_ADMIN`, atualiza nome, senha, escopo nulo e status ativo.
- Se o e-mail existir com outra role, o seed falha com erro claro para evitar promoção acidental.

## Cadastro de empresa

A entidade principal de empresa é `Tenant`. Para compatibilidade temporária com o fluxo legado, a tela de Empresas ainda usa o endpoint de `managers`, e os dados são espelhados entre `managers` e `tenants`.

Campos adicionados:

- `cnpj`
- `phone`
- `email`
- `contactName`
- `notes`
- `deletedAt`

O campo `active` continua existindo.

## Exclusão segura de usuários

Usuários usam soft delete:

- `active = false`
- `refreshToken = null`
- `deletedAt = now()`
- vínculos em `user_stores` são removidos antes da exclusão lógica

Regras:

- `PLATFORM_ADMIN` não pode ser excluído pelo fluxo comum.
- Não é permitido excluir o último `ADMIN` ativo de uma empresa.
- `MANAGER` só pode excluir `OPERATIONAL` e `CLIENT`.
- Histórico operacional é preservado porque campanhas, métricas e auditorias não são removidas.

Endpoint:

```http
DELETE /api/users/:id
```

## Exclusão segura de empresas

Empresas também usam `deletedAt`, mas a exclusão é bloqueada quando existem dependências ativas.

Dependências verificadas nesta etapa:

- usuários ativos/não excluídos no tenant
- lojas não excluídas vinculadas ao tenant
- vínculos `user_stores` das lojas
- integrações de loja
- contas de anúncio
- campanhas
- métricas ligadas às campanhas
- insights ligados às campanhas

Se houver dependências, o endpoint retorna erro explicando as contagens que impedem a exclusão. Isso evita quebrar lojas, integrações, contas de anúncio, campanhas, métricas e insights ligados à empresa.

Endpoint:

```http
DELETE /api/managers/:id
```

O endpoint é restrito a `PLATFORM_ADMIN`.

## Exclusão segura de lojas

Lojas também usam soft delete:

- `active = false`
- `deletedAt = now()`
- vínculos em `user_stores` são removidos quando a exclusão é permitida

Antes de excluir uma loja, o backend bloqueia a operação se existirem dependências que preservam histórico ou integração ativa:

- campanhas vinculadas
- contas de anúncio vinculadas
- integração Meta com status `CONNECTED`

Lojas com `deletedAt` preenchido não aparecem nas listagens padrão e não podem ser usadas em operações novas, porque as consultas de store validam `deletedAt IS NULL`. Esse fluxo permite remover lojas vazias com segurança e, depois disso, excluir a empresa quando não houver outras dependências ativas.

Endpoint:

```http
DELETE /api/stores/:id
```

## Migração

Migration criada:

- `1776600000000-CompanyFieldsAndSoftDeletes`
- `1776610000000-AddStoreSoftDelete`

Elas adicionam os campos comerciais e `deletedAt` em `tenants` e `managers`, `deletedAt` em `users`, e `deletedAt` em `stores`.

## Próximos passos

- Criar um módulo `tenants` público para substituir gradualmente o endpoint legado `managers`.
- Migrar a UI de Empresas para endpoints `/tenants`.
- Adicionar contadores detalhados de dependências por empresa antes da exclusão.
