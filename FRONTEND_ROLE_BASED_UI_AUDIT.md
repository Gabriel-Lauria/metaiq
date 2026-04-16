# Frontend Role-Based UI Audit Report

## Overview
Comprehensive analysis of how role-based UI is implemented in the MetaIQ frontend, including navigation, buttons, integrations, and campaigns management.

**Date**: April 16, 2026  
**Scope**: metaiq-frontend Angular 19 application  
**Key Finding**: Integrations page is currently accessible to MANAGER role but should be OPERATIONAL-only

---

## 1. Navigation & Routing Structure

### File: [metaiq-frontend/src/app/app.routes.ts](metaiq-frontend/src/app/app.routes.ts)

**Routes with Role Guards:**

| Route | Roles Allowed | Status |
|-------|--------------|--------|
| `/dashboard` | All authenticated | ✅ Correct |
| `/campaigns` | ADMIN, MANAGER, OPERATIONAL | ⚠️ MANAGER shouldn't see |
| `/metrics` | OPERATIONAL | ✅ Correct |
| `/insights` | OPERATIONAL | ✅ Correct |
| `/results` | CLIENT | ✅ Correct |
| `/admin/managers` | ADMIN, PLATFORM_ADMIN | ✅ Correct |
| `/manager/stores` | ADMIN, PLATFORM_ADMIN, MANAGER | ✅ Correct (store management for managers) |
| `/manager/users` | ADMIN, PLATFORM_ADMIN, MANAGER | ✅ Correct (user management for managers) |
| `/manager/integrations` | ADMIN, PLATFORM_ADMIN, MANAGER | ❌ **CRITICAL: Should be OPERATIONAL-only** |

**Issue**: The integrations route includes MANAGER role, but integration with Meta should only be for OPERATIONAL users.

---

## 2. Sidebar Navigation - Conditional Rendering

### File: [metaiq-frontend/src/app/app.component.ts](metaiq-frontend/src/app/app.component.ts) & [metaiq-frontend/src/app/app.component.html](metaiq-frontend/src/app/app.component.html)

### Navigation Methods (TypeScript):

```typescript
canSeeCampaigns(): boolean {
  return this.authService.hasAnyRole([Role.ADMIN, Role.MANAGER, Role.OPERATIONAL]);
}

canSeeManagers(): boolean {
  return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN]);
}

canSeeTenantManagement(): boolean {
  return this.authService.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER]);
}

canSeeOperationalReadouts(): boolean {
  return this.authService.hasAnyRole([Role.OPERATIONAL]);
}

canSeeClientResults(): boolean {
  return this.authService.hasAnyRole([Role.CLIENT]);
}
```

### Navigation Items (HTML):

| Item | Condition | Roles | Status |
|------|-----------|-------|--------|
| Dashboard | Always | All | ✅ |
| Campanhas | `canSeeCampaigns()` | ADMIN, MANAGER, OPERATIONAL | ⚠️ |
| Métricas | `canSeeOperationalReadouts()` | OPERATIONAL | ✅ |
| Insights | `canSeeOperationalReadouts()` | OPERATIONAL | ✅ |
| Resultados | `canSeeClientResults()` | CLIENT | ✅ |
| Managers | `canSeeManagers()` | ADMIN, PLATFORM_ADMIN | ✅ |
| Stores | `canSeeTenantManagement()` | ADMIN, MANAGER, PLATFORM_ADMIN | ✅ |
| Usuários | `canSeeTenantManagement()` | ADMIN, MANAGER, PLATFORM_ADMIN | ✅ |
| **Integrações** | `canSeeTenantManagement()` | **ADMIN, MANAGER, PLATFORM_ADMIN** | ❌ |

**Issues**:
- ❌ **Integrations menu shows for MANAGER** - Should only show for OPERATIONAL
- ⚠️ **Campaigns showing for MANAGER** - MANAGER likely shouldn't manage campaigns directly


---

## 3. Integrations Component - Meta Connection UI

### File: [metaiq-frontend/src/app/features/integrations/integrations.component.ts](metaiq-frontend/src/app/features/integrations/integrations.component.ts) & [HTML](metaiq-frontend/src/app/features/integrations/integrations.component.html)

**Status**: ❌ **NO ROLE CHECKS IMPLEMENTED**

### Meta Integration Buttons:

| Button | Action | Current UI | Should Be |
|--------|--------|-----------|-----------|
| "Conectar com Meta" | OAuth flow initiation | Visible to anyone with access | Only OPERATIONAL |
| "Desconectar" | Revoke OAuth token | Visible to anyone with access | Only OPERATIONAL |
| "Buscar contas" | Fetch Meta Ad Accounts | Visible to anyone with access | Only OPERATIONAL |
| "Sincronizar contas" | Sync Ad Accounts to DB | Visible to anyone with access | Only OPERATIONAL |

**Code Analysis**:
```typescript
export class IntegrationsComponent implements OnInit {
  // NO AUTH SERVICE INJECTION
  // NO ROLE-BASED CONDITIONALS
  
  connect(store: Store): void {
    this.savingStoreId.set(store.id);
    this.api.startMetaOAuth(store.id)...  // NO ROLE CHECK
  }
  
  disconnect(store: Store): void {
    // NO ROLE CHECK
  }
  
  fetchAdAccounts(store: Store): void {
    // NO ROLE CHECK
  }
  
  syncAdAccounts(store: Store): void {
    // NO ROLE CHECK
  }
}
```

### HTML - No Conditional Rendering:
```html
<!-- All buttons visible without role checking -->
<button class="btn btn-primary" type="button" (click)="connect(store)">
  {{ savingStoreId() === store.id ? 'Abrindo Meta...' : 'Conectar com Meta' }}
</button>

<section class="ad-accounts-panel" *ngIf="selectedIntegration()?.status === 'CONNECTED'">
  <!-- Ad account management - no role guard -->
  <button (click)="fetchAdAccounts(store)">Buscar contas</button>
  <button (click)="syncAdAccounts(store)">Sincronizar contas</button>
</section>
```

**Finding**: The integrations component has **zero role-based UI conditionals**. Anyone with route access can see and trigger Meta integration buttons.

---

## 4. Campaigns Component - Operations

### File: [metaiq-frontend/src/app/features/campaigns/campaigns.component.ts](metaiq-frontend/src/app/features/campaigns/campaigns.component.ts) & [HTML](metaiq-frontend/src/app/features/campaigns/campaigns.component.html)

**Status**: ⚠️ **Buttons exist but are disabled (in development)**

### Campaign Operations Buttons:

| Button | Visibility | Status |
|--------|-----------|--------|
| "Visualizar Relatório" | All | Disabled - "Em desenvolvimento" |
| "Editar" | All | Disabled - "Em desenvolvimento" |
| "Pausar" (ACTIVE campaigns) | All | Disabled - "Em desenvolvimento" |
| "Ativar" (PAUSED campaigns) | All | Disabled - "Em desenvolvimento" |

**Code**:
```html
<div class="detail-actions">
  <button class="btn btn-secondary" disabled [title]="'Em desenvolvimento'">
    Visualizar Relatório
  </button>
  <button class="btn btn-secondary" disabled [title]="'Em desenvolvimento'">
    Editar
  </button>
  <button class="btn btn-danger" *ngIf="campaign.status === 'ACTIVE'" 
          disabled [title]="'Em desenvolvimento'">
    Pausar
  </button>
  <button class="btn btn-success" *ngIf="campaign.status === 'PAUSED'" 
          disabled [title]="'Em desenvolvimento'">
    Ativar
  </button>
</div>
```

**Finding**: Campaign edit/pause/start buttons exist but are disabled globally. No role-based conditionals. When enabled, they should be restricted appropriately.

---

## 5. Stores & Users Management Components

### Stores Component 
**File**: [metaiq-frontend/src/app/features/stores/stores.component.ts](metaiq-frontend/src/app/features/stores/stores.component.ts) & [HTML](metaiq-frontend/src/app/features/stores/stores.component.html)

**Role Check Implementation**: ✅ **Partial - exists but incomplete**

```typescript
isAdmin = computed(() => this.auth.getCurrentRole() === Role.PLATFORM_ADMIN);
```

**In HTML**:
```html
<div class="form-field" *ngIf="isAdmin()">
  <!-- Manager selection field - only for PLATFORM_ADMIN -->
</div>
```

**Issue**: Only checks for PLATFORM_ADMIN but this component is accessible to MANAGER too. Missing role context for what MANAGER can do vs PLATFORM_ADMIN.


### Users Component
**File**: [metaiq-frontend/src/app/features/users/users.component.ts](metaiq-frontend/src/app/features/users/users.component.ts) & [HTML](metaiq-frontend/src/app/features/users/users.component.html)

**Role Checks**: ✅ **Better implementation**

```typescript
isPlatformAdmin = computed(() => 
  this.auth.getCurrentRole() === Role.PLATFORM_ADMIN);

isAdmin = computed(() => 
  [Role.PLATFORM_ADMIN, Role.ADMIN].includes(this.auth.getCurrentRole() as Role));
```

**In HTML**:
```html
<div class="form-field" *ngIf="isPlatformAdmin() && role !== 'ADMIN' && role !== 'PLATFORM_ADMIN'">
  <!-- Tenant selection -->
</div>

<form class="toolbar section-panel" *ngIf="isPlatformAdmin()">
  <!-- Password reset form - PLATFORM_ADMIN only -->
</form>
```

**Finding**: Better role separation but still missing MANAGER-specific conditionals.

---

## 6. Auth Service - Role Support

### File: [metaiq-frontend/src/app/core/services/auth.service.ts](metaiq-frontend/src/app/core/services/auth.service.ts)

**Available Methods**:
```typescript
getCurrentRole(): Role | null
isAuthenticated(): boolean
hasAnyRole(roles: Role[]): boolean
```

**Status**: ✅ **Good - provides basic role checking**

**Usage Pattern**:
```typescript
if (this.authService.hasAnyRole([Role.OPERATIONAL])) {
  // show integration buttons
}
```

**Issue**: Not used in IntegrationsComponent!

---

## 7. Auth Guard - Route Protection

### File: [metaiq-frontend/src/app/core/guards/auth.guard.ts](metaiq-frontend/src/app/core/guards/auth.guard.ts)

**Status**: ✅ **Correctly implements route-level role checking**

```typescript
private canAccessRole(route: ActivatedRouteSnapshot): boolean {
  const roles = route.data['roles'] as Role[] | undefined;
  if (!roles?.length) {
    return true;
  }

  if (this.authService.hasRole(roles)) {
    return true;
  }

  this.router.navigate(['/dashboard']);
  return false;
}
```

**Finding**: Route guards are properly configured but route definitions have inconsistent role assignments.

---

## Critical Issues Summary

| # | Issue | Component | Severity | Impact |
|---|-------|-----------|----------|--------|
| 1 | Integrations route includes MANAGER | app.routes.ts:47 | 🔴 CRITICAL | MANAGER can access Meta integration UI |
| 2 | Integrations component NO role checks | integrations.component.ts | 🔴 CRITICAL | All authenticated users see "Connect to Meta" buttons |
| 3 | Integrations menu shows for MANAGER | app.component.html:95 | 🔴 CRITICAL | MANAGER sees integrations in sidebar |
| 4 | canSeeTenantManagement() includes Meta link | app.component.ts:124 | 🔴 CRITICAL | Uses wrong permission function |
| 5 | Campaigns route includes MANAGER | app.routes.ts:14 | 🟠 MAJOR | MANAGER shouldn't manage campaigns directly |
| 6 | No role context in Stores component | stores.component.ts | 🟡 MEDIUM | Unclear what MANAGER can do vs ADMIN |

---

## Required Changes

### 1️⃣ **Route Configuration** - [app.routes.ts](metaiq-frontend/src/app/app.routes.ts#L47)
```typescript
// Current (WRONG):
{
  path: 'manager/integrations',
  loadComponent: () => import('./features/integrations/integrations.component')
    .then(m => m.IntegrationsComponent),
  canActivate: [authGuard],
  data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER] },  // ❌
}

// Should be (for development UI access, but UI needs internal checks):
// Option 1: Restrict to OPERATIONAL
data: { roles: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL] }

// Option 2: Keep accessible but guard internally
// (Keep current route, but add role checks in component)
```

### 2️⃣ **Sidebar Navigation** - [app.component.ts](metaiq-frontend/src/app/app.component.ts#L124) & [app.component.html](metaiq-frontend/src/app/app.component.html#L95)

```typescript
// Add method:
canSeeIntegrations(): boolean {
  return this.authService.hasAnyRole([
    Role.PLATFORM_ADMIN, 
    Role.ADMIN, 
    Role.OPERATIONAL
  ]);
}
```

```html
<!-- Change from: *ngIf="canSeeTenantManagement()" -->
<a
  *ngIf="canSeeIntegrations()"
  routerLink="/manager/integrations"
  class="nav-item"
  [class.active]="isActive('/manager/integrations')"
  title="Integrações"
>
  <span class="nav-icon">I</span>
  <span class="nav-label">Integrações</span>
</a>
```

### 3️⃣ **Integrations Component** - [integrations.component.ts](metaiq-frontend/src/app/features/integrations/integrations.component.ts#L1)

```typescript
// Add:
import { AuthService } from '../../core/services/auth.service';
import { Role } from '../../core/models';

export class IntegrationsComponent implements OnInit {
  private auth = inject(AuthService);
  
  // Add role check:
  canManageMeta = computed(() => 
    this.auth.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL])
  );
  
  // Add guards to methods:
  connect(store: Store): void {
    if (!this.canManageMeta()) {
      this.ui.showError('Sem permissão', 'Você não tem permissão para conectar integração Meta.');
      return;
    }
    // ... existing code
  }
  
  disconnect(store: Store): void {
    if (!this.canManageMeta()) {
      this.ui.showError('Sem permissão', 'Você não tem permissão para desconectar integração Meta.');
      return;
    }
    // ... existing code
  }
  
  fetchAdAccounts(store: Store): void {
    if (!this.canManageMeta()) {
      this.ui.showError('Sem permissão', 'Você não tem permissão para buscar contas.');
      return;
    }
    // ... existing code
  }
  
  syncAdAccounts(store: Store): void {
    if (!this.canManageMeta()) {
      this.ui.showError('Sem permissão', 'Você não tem permissão para sincronizar.');
      return;
    }
    // ... existing code
  }
}
```

### 4️⃣ **Integrations HTML** - [integrations.component.html](metaiq-frontend/src/app/features/integrations/integrations.component.html)

```html
<!-- Add role guard to Meta connection buttons -->
<div class="detail-actions primary-actions" *ngIf="canManageMeta()">
  <button class="btn btn-primary" type="button" 
          (click)="connect(store)" 
          [disabled]="savingStoreId() === store.id">
    {{ savingStoreId() === store.id ? 'Abrindo Meta...' : 'Conectar com Meta' }}
  </button>
</div>

<!-- Add role guard to disconnect & ad accounts section -->
<div class="detail-actions" *ngIf="canManageMeta()">
  <button class="btn btn-danger" type="button" (click)="disconnect(store)" 
          [disabled]="savingStoreId() === store.id">
    Desconectar
  </button>
</div>

<section class="ad-accounts-panel" 
         *ngIf="canManageMeta() && selectedIntegration()?.status === 'CONNECTED'">
  <!-- Ad account management buttons -->
</section>

<!-- Show message if user doesn't have permission -->
<div class="ui-state-empty" *ngIf="!canManageMeta()">
  <p class="muted">Você não tem permissão para gerenciar integrações Meta.</p>
</div>
```

### 5️⃣ **Campaigns Route** - [app.routes.ts](metaiq-frontend/src/app/app.routes.ts#L14)

```typescript
// Review if MANAGER should have campaigns route
// Current: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL]
// Should be: [Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL] ?
data: { roles: [Role.ADMIN, Role.OPERATIONAL] },  // Remove MANAGER if not needed
```

---

## Current State vs. Required State

### CLIENT Role
| Feature | Currently Shows | Should Show | Status |
|---------|-----------------|------------|--------|
| Integrations | ❌ No (route guard) | ❌ No | ✅ Correct |
| Campaigns | ❌ No (route guard) | ❌ No | ✅ Correct |
| Meta buttons | N/A | N/A | ✅ Correct |

### OPERATIONAL Role  
| Feature | Currently Shows | Should Show | Status |
|---------|-----------------|------------|--------|
| Integrations | ❌ No menu item | ✅ Yes | ❌ BROKEN |
| Meta buttons | ❌ Can access if route somehow reached | ✅ Yes | ❌ BROKEN |
| Campaigns | ✅ Yes | ✅ Yes | ✅ Correct |

### MANAGER Role
| Feature | Currently Shows | Should Show | Status |
|---------|-----------------|------------|--------|
| Integrations menu | ✅ Yes | ❌ No | ❌ WRONG |
| Integrations page | ✅ Yes (via route) | ❌ No | ❌ WRONG |
| Meta buttons | ✅ Yes | ❌ No | ❌ WRONG |
| Campaigns | ✅ Yes | ⚠️ Unclear | ⚠️ NEEDS CLARIFICATION |

### ADMIN Role
| Feature | Currently Shows | Should Show | Status |
|---------|-----------------|------------|--------|
| Integrations menu | ✅ Yes | ✅ Yes | ✅ Correct |
| Integrations page | ✅ Yes | ✅ Yes | ✅ Correct |
| Meta buttons | ✅ Yes (no guard) | ✅ Yes | ✅ Correct (but needs verification) |

### PLATFORM_ADMIN Role  
| Feature | Currently Shows | Should Show | Status |
|---------|-----------------|------------|--------|
| Integrations menu | ✅ Yes | ✅ Yes | ✅ Correct |
| Integrations page | ✅ Yes | ✅ Yes | ✅ Correct |
| Meta buttons | ✅ Yes (no guard) | ✅ Yes | ✅ Correct (but needs verification) |

---

## Recommendations

### Priority 1 - CRITICAL (Block Meta for MANAGER)
1. ❌ Remove `/manager/integrations` route OR restrict roledata to exclude MANAGER
2. ❌ Remove Integrations menu item from MANAGER view
3. ❌ Add `canManageMeta()` check to all Meta operation buttons

### Priority 2 - IMPORTANT (Clarify OPERATIONAL access)
1. Create separate route or parameter: `/operational/integrations` or keep `/manager/integrations` but guard internally
2. Add `canSeeIntegrations()` method to AppComponent
3. Update integrations component to use role checks

### Priority 3 - MEDIUM (Review MANAGER scope)
1. Clarify if MANAGER should have Campaigns route access
2. Add role context to Stores/Users components for MANAGER vs ADMIN differences

### Priority 4 - NICE-TO-HAVE (Polish)
1. Add disabled state with tooltip for unauthorized users
2. Add audit logging for integration attempts
3. Create consistent pattern for role-based UI conditionals

---

## Files to Modify

1. [metaiq-frontend/src/app/app.routes.ts](metaiq-frontend/src/app/app.routes.ts)
2. [metaiq-frontend/src/app/app.component.ts](metaiq-frontend/src/app/app.component.ts)
3. [metaiq-frontend/src/app/app.component.html](metaiq-frontend/src/app/app.component.html)
4. [metaiq-frontend/src/app/features/integrations/integrations.component.ts](metaiq-frontend/src/app/features/integrations/integrations.component.ts)
5. [metaiq-frontend/src/app/features/integrations/integrations.component.html](metaiq-frontend/src/app/features/integrations/integrations.component.html)

---

## Testing Checklist

- [ ] CLIENT cannot access integrations page
- [ ] OPERATIONAL can see integrations menu
- [ ] OPERATIONAL can see "Connect to Meta" button
- [ ] MANAGER cannot see integrations menu
- [ ] MANAGER cannot see "Connect to Meta" button
- [ ] MANAGER attempting direct URL shows permission error
- [ ] ADMIN can see and use all integration features
- [ ] PLATFORM_ADMIN can see and use all integration features
