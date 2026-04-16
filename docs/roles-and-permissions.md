# MetaIQ - Matriz de Roles & Permissões

## Visão Geral

O MetaIQ utiliza um modelo de controle de acesso baseado em roles com 5 papéis principais. Cada papel tem responsabilidades bem definidas e permissões de escopo específicas.

---

## 1. Roles Definidos

### PLATFORM_ADMIN
**Descrição**: Super administrador da plataforma

**Responsabilidades**:
- Controla a plataforma inteira
- Cria empresas/tenants
- Cria administradores principais
- Intervém em qualquer tenant
- Integra com Meta por override técnico

**Permissões**:
- Bypass de todas as validações de escopo
- Acesso a todos os módulos
- Visão global da plataforma
- Criação de entidades em qualquer tenant

---

### ADMIN
**Descrição**: Administrador de empresa/tenant

**Responsabilidades**:
- Controla a empresa inteira
- Cria e gerencia managers
- Cria e gerencia stores
- Supervisiona operações
- Não integra Meta (não é executor)

**Permissões**:
- Acesso total a recursos do tenant
- Leitura de status de integrações (somente visão)
- Opcionalmente desconectar integração
- Criar managers
- Criar stores
- Ver todas as campanhas (leitura)
- Ver todas as métricas

**Restrições**:
- ❌ NÃO pode iniciar OAuth com Meta
- ❌ NÃO pode sincronizar contas Meta
- ❌ NÃO pode criar/pausar campanhas

---

### MANAGER
**Descrição**: Gestor/Supervisor operacional

**Responsabilidades**:
- Supervisiona a operação do dia a dia
- Cria e gerencia operacionais
- Cria e gerencia clientes finais
- Vincula/desvincula operacionais às stores
- Altera senhas de operacionais
- Supervisiona campanhas (somente visão)

**Permissões**:
- Acesso a todos os stores do tenant
- Ver status de integrações (somente leitura)
- Criar operacionais
- Criar clientes finais
- Vincular operacionais/clientes às stores
- Alterar senhas
- Ver campanhas (somente leitura)
- Ver métricas (somente leitura)
- Ver relatórios operacionais

**Restrições**:
- ❌ NÃO pode iniciar OAuth com Meta
- ❌ NÃO pode sincronizar contas Meta
- ❌ NÃO pode criar campanhas
- ❌ NÃO pode pausar/resumir campanhas
- ❌ NÃO pode desconectar integração

---

### OPERATIONAL
**Descrição**: Operador executivo de campanhas

**Responsabilidades**:
- Executor principal da integração com Meta
- Opera campanhas das lojas vinculadas
- Sincroniza contas e campanhas Meta
- Acompanha métricas e performance
- Acompanha insights

**Permissões**:
- Acesso apenas a stores às quais está vinculado
- Iniciar OAuth com Meta (nas stores vinculadas)
- Sincronizar contas Meta
- Sincronizar campanhas Meta
- Criar campanhas
- Pausar/resumir campanhas
- Ver métricas (das stores vinculadas)
- Ver insights (das stores vinculadas)
- Desconectar integração (das stores vinculadas)

**Restrições**:
- 🔒 Escopo limitado a stores vinculadas (via UserStore)
- ❌ NÃO pode criar usuários
- ❌ NÃO pode gerenciar stores
- ❌ NÃO pode ver operacionais de outras stores

---

### CLIENT
**Descrição**: Cliente final/Dono da loja

**Responsabilidades**:
- Acompanha resultados e performance
- Visualiza campanhas ativas
- Acompanha métricas de sua loja

**Permissões**:
- Acesso de leitura às stores às quais está vinculado
- Ver campanhas (leitura apenas)
- Ver métricas (das stores vinculadas)
- Ver resultados e performance

**Restrições**:
- 🔒 Escopo limitado a stores vinculadas (via UserStore)
- ❌ NÃO pode ver status de integração
- ❌ NÃO pode criar/editar campanhas
- ❌ NÃO pode pausar campanhas
- ❌ NÃO pode integrar Meta
- ❌ NÃO pode gerenciar nada

---

## 2. Matriz de Permissões por Funcionalidade

### Integração com Meta

| Funcionalidade | PLATFORM_ADMIN | ADMIN | MANAGER | OPERATIONAL | CLIENT |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver status integração | ✅ | ✅ | ✅ | ✅ | ❌ |
| Iniciar OAuth | ✅ | ❌ | ❌ | ✅* | ❌ |
| Sincronizar contas | ✅ | ❌ | ❌ | ✅* | ❌ |
| Sincronizar campanhas | ✅ | ❌ | ❌ | ✅* | ❌ |
| Desconectar integração | ✅ | ❌ | ❌ | ✅* | ❌ |

*Apenas nas stores vinculadas

---

### Campanhas

| Funcionalidade | PLATFORM_ADMIN | ADMIN | MANAGER | OPERATIONAL | CLIENT |
|---|:---:|:---:|:---:|:---:|:---:|
| Listar campanhas | ✅ | ✅ | ✅ | ✅* | ✅* |
| Ver detalhes | ✅ | ✅ | ✅ | ✅* | ✅* |
| Criar campanha | ✅ | ❌ | ❌ | ✅* | ❌ |
| Editar campanha | ✅ | ❌ | ❌ | ✅* | ❌ |
| Pausar/Resumir | ✅ | ❌ | ❌ | ✅* | ❌ |
| Ver relatório | ✅ | ✅ | ✅ | ✅* | ✅* |

*Apenas nas stores vinculadas (para OPERATIONAL e CLIENT)

---

### Métricas & Insights

| Funcionalidade | PLATFORM_ADMIN | ADMIN | MANAGER | OPERATIONAL | CLIENT |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver insights | ✅ | ✅ | ✅ | ✅* | ✅* |
| Ver métricas | ✅ | ✅ | ✅ | ✅* | ✅* |
| Filtros globais | ✅ | ✅ | ✅ | ❌ | ❌ |
| Relatórios por loja | ✅ | ✅ | ✅ | ✅* | ✅* |
| Relatórios por operador | ✅ | ✅ | ✅ | ✅* | ❌ |

*Apenas das stores vinculadas

---

### Gestão de Usuários & Stores

| Funcionalidade | PLATFORM_ADMIN | ADMIN | MANAGER | OPERATIONAL | CLIENT |
|---|:---:|:---:|:---:|:---:|:---:|
| Criar Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver Managers | ✅ | ✅ | ❌ | ❌ | ❌ |
| Criar Manager | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver Operacionais | ✅ | ✅ | ✅ | ✅* | ❌ |
| Criar Operacional | ✅ | ✅ | ✅ | ❌ | ❌ |
| Alterar senha | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ver Stores | ✅ | ✅ | ✅ | ✅* | ✅* |
| Criar Store | ✅ | ✅ | ❌ | ❌ | ❌ |
| Vincular Operacional | ✅ | ✅ | ✅ | ❌ | ❌ |
| Vincular Cliente | ✅ | ✅ | ✅ | ❌ | ❌ |

*Apenas das stores vinculadas (para OPERATIONAL e CLIENT)

---

## 3. Regras de Escopo

### PLATFORM_ADMIN
- **Escopo**: Global
- **Restrição**: Nenhuma
- **Validação**: Nenhuma validação de propriedade

### ADMIN
- **Escopo**: Tenant
- **Restrição**: Acesso apenas a recursos do tenant
- **Validação**: Valida que o recurso pertence ao tenant

### MANAGER
- **Escopo**: Tenant
- **Restrição**: Acesso apenas a stores do tenant
- **Validação**: Valida que a store pertence ao tenant

### OPERATIONAL
- **Escopo**: Stores vinculadas
- **Restrição**: Acesso apenas a stores nas quais está vinculado via `UserStore`
- **Validação**: Dupla validação - tenant + vínculo direto

### CLIENT
- **Escopo**: Stores vinculadas
- **Restrição**: Acesso apenas a stores nas quais está vinculado via `UserStore`
- **Validação**: Dupla validação - tenant + vínculo direto

---

## 4. Fluxo de Autenticação & Autorização

### Fluxo de Integração Meta (Correto)

```
1. OPERATIONAL faz login
2. Acessa /manager/integrations
3. Seleciona uma store (vinculada)
4. Clica "Conectar com Meta"
5. Sistema verifica:
   - ✅ User role é OPERATIONAL
   - ✅ Store existe
   - ✅ User está vinculado à store via UserStore
6. PERMITTED ✅ OAuth iniciado
```

### Fluxo de Operação por Manager (Bloqueado)

```
1. MANAGER faz login
2. Tenta acessar /manager/integrations
3. Sistema verifica role
4. BLOCKED ❌ Route guard bloqueia acesso
5. Menu não mostra "Integrações"
```

### Fluxo de Criação de Campanha (Correto)

```
1. OPERATIONAL faz login
2. Acessa /campaigns
3. Clica "Criar Campanha"
4. Botão está habilitado (role permite)
5. Preenche dados
6. Submete
7. Sistema verifica:
   - ✅ User role é OPERATIONAL
   - ✅ Store pertence ao tenant do user
   - ✅ User está vinculado à store
8. PERMITTED ✅ Campanha criada
```

---

## 5. Implementação Técnica

### Backend (NestJS/TypeORM)

**Guardiões de Autorização**:
- `JwtAuthGuard`: Valida token JWT
- `RolesGuard`: Verifica `@Roles()` decorator
- `OwnershipGuard`: Valida propriedade do recurso via `AccessScopeService`

**Serviços de Validação**:
- `AccessScopeService`: 
  - `validateStoreAccess(user, storeId)`: Valida acesso à store
  - `getAllowedStoreIds(user)`: Retorna stores acessíveis
  - `applyCampaignScope(query, user)`: Aplica filtros automáticos

**Decorador Principal**:
```typescript
@Roles(Role.PLATFORM_ADMIN, Role.OPERATIONAL)
@Post('connect')
connect(...) { ... }
```

### Frontend (Angular 17+)

**Guardiões de Rota**:
- `authGuard`: Verifica autenticação + roles
- Route `data: { roles: [...] }` define quem acessa

**Serviço de Verificação**:
- `AuthService.hasAnyRole([roles])`: Verifica múltiplos roles

**Exemplo em Component**:
```typescript
canManageIntegrations(): boolean {
  return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.OPERATIONAL]);
}
```

```html
<button [disabled]="!canManageIntegrations()">Conectar com Meta</button>
```

---

## 6. Casos de Uso Reais

### Caso 1: Store "Prata e Art"

**Setup**:
- Admin: `admin@prataeart.com` (ADMIN)
- Manager: `gestor@prataeart.com` (MANAGER)
- Operational: `maiara@prataeart.com` (OPERATIONAL)
- Client: `contato@prataeart.com` (CLIENT)

**O que cada um vê/pode fazer**:

**Admin**:
- ✅ Vê todas as stores
- ✅ Vê status de integração (leitura)
- ✅ Cria novo gestor
- ✅ Cria nova store
- ❌ Não conecta Meta
- ❌ Não cria campanha

**Gestor**:
- ✅ Vê todas as stores do tenant
- ✅ Vê status de integração (leitura)
- ✅ Cria novo operacional
- ✅ Vincula operacional à store
- ❌ Não aparece menu "Integrações"
- ❌ Não pode pausar campanha

**Operacional (Maiara)**:
- ✅ Vê apenas "Prata e Art" (vinculada)
- ✅ Menu "Integrações" disponível
- ✅ Botão "Conectar com Meta" habilitado
- ✅ Pode sincronizar contas
- ✅ Pode criar/pausar campanhas
- ✅ Vê métricas de "Prata e Art"

**Cliente**:
- ✅ Vê apenas "Prata e Art"
- ✅ Vê campanhas (somente leitura)
- ✅ Vê métricas
- ❌ Sem menu "Integrações"
- ❌ Botões de ação desabilitados

---

## 7. Segurança

### Princípio: Backend é a Fonte de Verdade

**Frontend**:
- Esconde UI baseada em role (UX)
- NÃO enforça segurança

**Backend**:
- Valida role em CADA endpoint
- Valida escopo em CADA operação
- Rejeita requisições inválidas

### Exemplo Cenário de Ataque

**Cenário**: Um MANAGER tenta fazer POST para `/campaigns` por script

```
POST /campaigns
Authorization: Bearer <token_manager>
Body: { name: "Hacked", ... }

Resposta:
403 Forbidden
{ error: "Apenas OPERATIONAL podem criar campanhas" }
```

**Resultado**: ❌ Bloqueado pelo backend

---

## 8. Migrações & Atualizações

### Quando Adicionar Novo Role

1. Adicionar em [role.enum.ts](../metaiq-backend/src/common/enums/role.enum.ts)
2. Atualizar `AccessScopeService`
3. Revisitar todos os `@Roles()` decorators
4. Atualizar frontend guards
5. **Atualizar este documento**

### Quando Alterar Permissão de Funcionalidade

1. Atualizar `@Roles()` decorator
2. Se necessário, atualizar `AccessScopeService`
3. Atualizar frontend (route data + component conditionals)
4. **Atualizar este documento**
5. Testar com cada role

---

## 9. Testes de Validação

### Teste 1: OPERATIONAL Integra com Meta
- [ ] Login como OPERATIONAL
- [ ] Menu "Integrações" aparece
- [ ] Clica "Conectar com Meta"
- [ ] OAuth iniciado com sucesso

### Teste 2: MANAGER NÃO acessa Integrações
- [ ] Login como MANAGER
- [ ] Menu "Integrações" NÃO aparece
- [ ] Tenta navegar para `/manager/integrations`
- [ ] Bloqueado (redirecionado ou 403)

### Teste 3: CLIENT Vê Campanhas (Somente Leitura)
- [ ] Login como CLIENT
- [ ] Acessa `/campaigns`
- [ ] Vê lista de campanhas
- [ ] Botões "Criar", "Pausar" estão desabilitados
- [ ] Pode clicar "Ver Relatório"

### Teste 4: Store Bloqueada
- [ ] OPERATIONAL de loja A
- [ ] Tenta acessar store B (não vinculada)
- [ ] API retorna 403
- [ ] Store B não aparece em `/campaigns`

---

## 10. Troubleshooting

### Problema: MANAGER Consegue Criar Campanha

**Causa**: Frontend botão está habilitado
**Verificação**: 
- [ ] Backend endpoint verificar `@Roles()` - deve ser `OPERATIONAL` apenas
- [ ] Frontend component injetar `AuthService`
- [ ] Botão ter `[disabled]="!canManageOperations()"`

### Problema: OPERATIONAL Não Consegue Acessar Integração

**Causa Possível 1**: Rota não permite role
- [ ] Verificar `app.routes.ts` - `data: { roles: [...] }`
- [ ] Deve incluir `Role.OPERATIONAL`

**Causa Possível 2**: Não está vinculado à store
- [ ] Verificar tabela `user_stores`
- [ ] Executar: `SELECT * FROM user_stores WHERE user_id = '...' AND store_id = '...'`
- [ ] Se vazio, vincular

### Problema: CLIENT Vê Botão "Conectar Meta"

**Causa**: Frontend não protege com role
- [ ] Verificar `integrations.component.html`
- [ ] Botão deve ter `[disabled]="!canManageIntegrations()"`
- [ ] `canManageIntegrations()` deve retornar `false` para CLIENT

---

## 11. Changelog

### v2.0.0 (16/04/2026) - Initial Alignment
- OPERATIONAL é o executor de Meta integration
- MANAGER removido de acesso de escrita
- CLIENT adicionado com acesso de leitura
- Matriz completa de permissões criada
- Frontend e backend alinhados

---

**Documentação Criada**: 16/04/2026
**Última Atualização**: 16/04/2026
**Versão**: 2.0.0
