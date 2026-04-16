# Tenant Refactor

## Problema do Modelo Antigo

O MetaIQ usava `managerId` em `users` e `stores` como base principal de isolamento.
Esse desenho prendia uma Store a um Manager específico, dificultava múltiplos gestores no mesmo cliente/empresa e tornava reorganizações de equipe mais arriscadas.

## Novo Modelo Conceitual

- `Tenant` representa a empresa/cliente.
- `Store` pertence ao `Tenant`.
- `User` pertence ao `Tenant`, exceto `PLATFORM_ADMIN`.
- `Manager` passa a ser papel de usuário dentro de um tenant, não dono estrutural de stores.
- `UserStore` continua sendo a regra de escopo fino para `OPERATIONAL` e `CLIENT`.

## Regras de Acesso

- `PLATFORM_ADMIN`: acesso global, sem obrigatoriedade de `tenantId`.
- `ADMIN`: acesso total dentro do próprio tenant.
- `MANAGER`: gerencia stores, usuários operacionais e clientes do próprio tenant.
- `OPERATIONAL`: acessa apenas stores vinculadas via `user_stores`.
- `CLIENT`: leitura limitada às stores vinculadas via `user_stores`.

O `AccessScopeService` deve usar `tenantId` como fronteira principal:

```text
store.tenantId === user.tenantId
```

O uso de `store.managerId === user.managerId` não deve ser usado em novas regras de autorização.

## Banco de Dados

Foi criada a tabela `tenants` com:

- `id`
- `name`
- `active`
- `createdAt`
- `updatedAt`

Foram adicionados:

- `users.tenantId`
- `stores.tenantId`

Ambos possuem FK para `tenants.id`. `stores.tenantId` é obrigatório. `users.tenantId` é nullable para permitir `PLATFORM_ADMIN`.

## Migration

As migrations de transição:

- criam `tenants`
- criam um tenant de plataforma
- criam tenants iniciais a partir dos managers atuais
- populam `users.tenantId` a partir de `managerId`, quando aplicável
- populam `stores.tenantId` a partir de `managerId`
- mantêm `managerId` para compatibilidade
- convertem usuários globais antigos (`ADMIN` sem `managerId`) para `PLATFORM_ADMIN`

## Compatibilidade Temporária

`managerId` permanece nas tabelas e entidades para compatibilidade com telas e dados existentes.
Durante a transição:

- não remover `managerId`
- não usar `managerId` como ownership principal
- aceitar `managerId` em alguns payloads antigos como alias de `tenantId`
- planejar remoção posterior em uma fase dedicada

## Próximos Passos

- Criar telas/API próprias de Tenants, se necessário.
- Remover dependência visual de Managers como seletor de tenant no frontend.
- Migrar contratos públicos de `managerId` para `tenantId`.
- Remover `managerId` de `Store` e `User` somente após uma fase de limpeza controlada.
