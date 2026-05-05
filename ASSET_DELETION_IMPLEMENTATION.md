# Exclusão Segura de Imagens/Assets - Implementação Completa

Data: 30/04/2026

## 📋 Resumo da Implementação

Implementação de um sistema seguro para exclusão/arquivamento de imagens enviadas no fluxo Nexora, garantindo que campanhas publicadas não sejam quebradas.

---

## 🔧 BACKEND - Alterações

### 1. **Entidade Asset** (`asset.entity.ts`)
Adicionados campos para soft delete:
- `archivedAt: Date | null` - Data quando o asset foi arquivado
- `deletedAt: Date | null` - Data quando o asset foi soft deletado

### 2. **Migração** (`1777000000000-AddAssetSoftDelete.ts`)
Nova migração para:
- Adicionar coluna `archivedAt` à tabela `assets`
- Adicionar coluna `deletedAt` à tabela `assets`
- Executar: `npm run typeorm migration:run`

### 3. **AssetsService** (`assets.service.ts`)
Novos métodos:

```typescript
// Soft delete - marca como deletado (reversível)
async softDeleteAsset(assetId: string): Promise<Asset>

// Arquivar - marca como arquivado (para assets em uso)
async archiveAsset(assetId: string): Promise<Asset>

// Validar e retornar asset com checks de soft delete
async getAssetWithSoftDeleteCheck(storeId: string, assetId: string): Promise<Asset>
```

### 4. **MetaAssetsDeleteService** (Novo arquivo)
Serviço que implementa a lógica de exclusão segura:

```typescript
interface DeleteAssetResult {
  assetId: string;
  action: 'soft_deleted' | 'archived';
  reason?: string;
  message: string;
}

async deleteAssetForUser(
  user: AuthenticatedUser,
  storeId: string,
  assetId: string
): Promise<DeleteAssetResult>
```

**Regras implementadas:**
- ✅ Valida ownership (asset pertence à store)
- ✅ Verifica se asset está em campanhas publicadas
- ✅ Se em campanhas → **ARQUIVA** (preserva histórico)
- ✅ Se não está em campanhas → **SOFT DELETE** (removível)
- ✅ Logs detalhados com motivo da ação

### 5. **MetaIntegrationController** (atualizado)
Novo endpoint:

```
DELETE /api/integrations/meta/stores/:storeId/assets/images/:assetId
```

**Resposta:**
```json
{
  "message": "Imagem removida com sucesso.",
  "action": "soft_deleted"
}
```

ou

```json
{
  "message": "Imagem arquivada com segurança. Estava sendo usada em 1 campanha(s).",
  "action": "archived",
  "reason": "Asset está vinculado a 1 campanha(s) publicada(s)"
}
```

**Guards de autorização:**
- `@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)` - CLIENT bloqueado
- RolesGuard valida automaticamente
- Audit automático de todas as ações

### 6. **Testes Backend**
Arquivos criados:

1. `meta-assets-delete.service.spec.ts` - Testes unitários
   - ✅ Soft delete quando não em campanhas
   - ✅ Arquivamento quando em campanhas
   - ✅ Validação de ownership
   - ✅ Tratamento de erros

2. `meta-assets-delete.e2e-spec.ts` - Testes E2E
   - ✅ Endpoint DELETE funcional
   - ✅ Resposta correta por cenário
   - ✅ Audit logging
   - ✅ Tratamento de 404 e 400

---

## 🎨 FRONTEND - Alterações

### 1. **ApiService** (`api.service.ts`)
Novo método para deletar assets:

```typescript
deleteMetaImageAsset(
  storeId: string,
  assetId: string
): Observable<{ message: string; action: 'soft_deleted' | 'archived'; reason?: string }>
```

### 2. **ImageUploadComponent** (atualizado)
`image-upload.component.ts` - Novos signals:
```typescript
readonly deleteConfirmAssetId = signal<string | null>(null);
readonly deleteConfirmAssetName = signal<string | null>(null);
readonly deleting = signal(false);
```

Novos métodos:
```typescript
openDeleteConfirm(asset: Asset, event: Event): void
closeDeleteConfirm(): void
deleteAsset(assetId: string): void
```

### 3. **Template HTML** (atualizado)
`image-upload.component.html`:

**Asset Card com botão de exclusão:**
```html
<div class="asset-card-wrapper">
  <button class="asset-card" (click)="selectAsset(asset)">
    <img [src]="asset.storageUrl" />
    <span>{{ asset.width }}x{{ asset.height }}</span>
  </button>
  <button class="asset-delete-btn" (click)="openDeleteConfirm(asset, $event)">✕</button>
</div>
```

**Modal de confirmação:**
```html
<div class="modal-overlay" *ngIf="deleteConfirmAssetId()">
  <div class="modal-dialog">
    <div class="modal-header">
      <h3>Remover imagem?</h3>
    </div>
    <div class="modal-body">
      <p>Você tem certeza que deseja remover <strong>{{ deleteConfirmAssetName() }}</strong>?</p>
      <div class="modal-info">
        <p>Se vinculada a campanhas publicadas, será apenas arquivada.</p>
        <p>Se não vinculada, será permanentemente removida.</p>
      </div>
    </div>
    <div class="modal-footer">
      <button (click)="closeDeleteConfirm()">Cancelar</button>
      <button (click)="deleteAsset(deleteConfirmAssetId()!)">Remover</button>
    </div>
  </div>
</div>
```

### 4. **Estilos SCSS** (adicionados)
`image-upload.component.scss`:

- `.asset-delete-btn` - Botão ✕ no canto do card (aparece ao hover)
- `.modal-overlay` - Fundo escuro com fade-in
- `.modal-dialog` - Dialog com slide-up animation
- `.modal-header`, `.modal-body`, `.modal-footer` - Seções do modal
- `.btn`, `.btn-secondary`, `.btn-danger` - Botões estilizados

---

## 📊 Fluxo de Exclusão

### Cenário 1: Asset NÃO está em campanhas publicadas
```
User clica "✕" no asset
  ↓
Modal de confirmação
  ↓
DELETE /api/integrations/meta/stores/:storeId/assets/images/:assetId
  ↓
Backend: Verifica se está em campanhas → NÃO está
  ↓
softDeleteAsset() → deletedAt = now()
  ↓
Response: action = "soft_deleted"
  ↓
Frontend: Remove da lista visual
  ↓
Toast: "Imagem removida com sucesso."
```

### Cenário 2: Asset ESTÁ em campanhas publicadas
```
User clica "✕" no asset
  ↓
Modal de confirmação
  ↓
DELETE /api/integrations/meta/stores/:storeId/assets/images/:assetId
  ↓
Backend: Verifica se está em campanhas → ESTÁ em 2 campanhas
  ↓
archiveAsset() → archivedAt = now()
  ↓
Response: action = "archived", reason = "Asset está vinculado a 2 campanha(s)"
  ↓
Frontend: Remove da lista visual
  ↓
Toast: "Imagem arquivada com segurança. Estava sendo usada em 2 campanha(s)."
```

---

## 🔐 Validações de Segurança

### Backend
✅ **Ownership**: Asset deve pertencer à store do usuário
✅ **Autorização**: Apenas ADMIN, MANAGER, OPERATIONAL (CLIENT bloqueado)
✅ **Tenant Isolation**: Validação automática via AccessScopeService
✅ **Audit**: Todas as ações são logadas com detalhes
✅ **Idempotência**: Verificação se asset já foi deletado/arquivado

### Frontend
✅ **Modal de confirmação**: Previne exclusões acidentais
✅ **Feedback visual claro**: Mensagens explicativas
✅ **Estado consistente**: Lista atualiza após ação
✅ **Handling de erros**: Toast com mensagem do servidor

---

## 🚀 Build & Testes

### Backend
```bash
cd metaiq-backend

# Build
npm run build  # ✅ Sucesso

# Testes
npm test  # Inclui meta-assets-delete.service.spec.ts
npm run test:e2e  # Inclui meta-assets-delete.e2e-spec.ts
```

### Frontend
```bash
cd metaiq-frontend

# Build
npm run build  # ✅ Sucesso (565.90 kB - aviso de bundle size apenas)

# Testes (opcional)
npm test  # Se houver testes configurados
```

---

## 📝 Resumo de Arquivos Alterados/Criados

### Backend
```
✨ src/modules/assets/entities/asset.entity.ts (editado)
✨ src/migrations/1777000000000-AddAssetSoftDelete.ts (novo)
✨ src/modules/assets/assets.service.ts (editado)
✨ src/modules/integrations/meta/meta-assets-delete.service.ts (novo)
✨ src/modules/integrations/meta/meta-assets-delete.service.spec.ts (novo)
✨ src/modules/integrations/meta/meta.controller.ts (editado)
✨ src/modules/integrations/meta/meta.module.ts (editado)
✨ test/meta-assets-delete.e2e-spec.ts (novo)
```

### Frontend
```
✨ src/app/core/services/api.service.ts (editado)
✨ src/app/shared/components/image-upload/image-upload.component.ts (editado)
✨ src/app/shared/components/image-upload/image-upload.component.html (editado)
✨ src/app/shared/components/image-upload/image-upload.component.scss (editado)
```

---

## ✅ Checklist Final

- [x] Backend: Campos soft delete adicionados
- [x] Backend: Migração criada
- [x] Backend: Service de exclusão segura implementado
- [x] Backend: Endpoint DELETE com autorização
- [x] Backend: Auditoria implementada
- [x] Backend: Testes unitários
- [x] Backend: Testes E2E
- [x] Backend: Build bem-sucedido
- [x] Frontend: Método de DELETE no ApiService
- [x] Frontend: Componente com modal de confirmação
- [x] Frontend: Botão de exclusão nos cards
- [x] Frontend: Estilos do modal
- [x] Frontend: Feedback visual (toast)
- [x] Frontend: Build bem-sucedido
- [x] Validações de segurança (ownership, roles, audit)
- [x] Documentação completa

---

## 🎯 Próximos Passos (Opcional)

1. **Integração com Meta API**: Remover asset do Meta Ads Manager também
   ```typescript
   // Em MetaAssetsDeleteService
   private async deleteFromMeta(asset: Asset): Promise<void>
   ```

2. **Recuperação de soft deletes**: Adicionar endpoint para restaurar assets deletados
   ```
   PATCH /api/assets/:assetId/restore
   ```

3. **Limpeza periódica**: Cron job para limpar assets muito antigos
   ```typescript
   // CronService
   @Cron('0 0 * * *')
   async cleanupOldDeletedAssets()
   ```

4. **Relatório de assets**: Dashboard mostrando assets ativos vs arquivados vs deletados

---

## 📞 Suporte

Para dúvidas sobre a implementação:
1. Consulte os comentários no código
2. Execute os testes para validar comportamento
3. Verifique os logs de audit para rastrear ações

---

**Implementação concluída com sucesso! 🎉**
