# MetaIQ Backend - Authentication, Authorization & RBAC Audit

**Date**: April 16, 2026  
**Status**: Comprehensive audit completed - Critical issues identified

---

## Executive Summary

The MetaIQ backend has a well-structured authentication and authorization system with NestJS guards, decorators, and multi-tenant data isolation. However, **critical role-based access control violations** exist in Meta integration endpoints where `MANAGER` role has unauthorized access to Meta operations (should be `OPERATIONAL` only per business rules).

---

## 1. ROLE DEFINITIONS

### Location
📄 [metaiq-backend/src/common/enums/role.enum.ts](metaiq-backend/src/common/enums/role.enum.ts)

### Defined Roles
```typescript
export enum Role {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',  // Super admin - platform level
  ADMIN = 'ADMIN',                    // Tenant/company admin
  MANAGER = 'MANAGER',                // Supervisor role
  OPERATIONAL = 'OPERATIONAL',        // Executor role
  CLIENT = 'CLIENT',                  // Read-only access
}
```

**Status**: ✓ Correctly defined

### Integration Enums
📄 [metaiq-backend/src/common/enums/integration.enum.ts](metaiq-backend/src/common/enums/integration.enum.ts)

- `IntegrationProvider.META` - Meta/Facebook provider
- `IntegrationStatus`: NOT_CONNECTED, CONNECTING, CONNECTED, EXPIRED, ERROR
- `SyncStatus`: NEVER_SYNCED, IN_PROGRESS, SUCCESS, ERROR

---

## 2. AUTHENTICATION & AUTHORIZATION GUARDS

### 2.1 JWT Authentication Guard
📄 [metaiq-backend/src/common/guards/jwt-auth.guard.ts](metaiq-backend/src/common/guards/jwt-auth.guard.ts)

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- Validates JWT tokens
- Must be **first** in guard chain
- Extracts user from token and attaches to request.user

### 2.2 Roles Guard
📄 [metaiq-backend/src/common/guards/roles.guard.ts](metaiq-backend/src/common/guards/roles.guard.ts)

**Behavior**:
- Reads `@Roles()` decorator metadata
- Extracts `user.role` from request
- **PLATFORM_ADMIN bypasses all role checks** (superuser)
- Throws `ForbiddenException` if user role not in allowed list

**Key Logic**:
```typescript
if (userRole === Role.PLATFORM_ADMIN) {
  return true; // Always allowed
}

if (userRole && requiredRoles.includes(userRole)) {
  return true; // In allowed list
}

throw new ForbiddenException('Usuário sem permissão para acessar este recurso');
```

### 2.3 Ownership Guard
📄 [metaiq-backend/src/common/guards/ownership.guard.ts](metaiq-backend/src/common/guards/ownership.guard.ts)

**Purpose**: Validates user has access to specific resource (campaign, adAccount, insight)

**Supported Resources**:
- `'campaign'` - Campaign entity
- `'adAccount'` - Ad Account entity
- `'insight'` - Insight entity

**Behavior**:
1. Reads `@CheckOwnership()` decorator
2. Extracts resource ID from URL parameter
3. Fetches resource from database
4. Validates through `AccessScopeService`
5. Prevents cross-tenant/cross-user access

**Guard Chain Example**:
```typescript
@Get(':id')
@CheckOwnership('campaign')
@UseGuards(OwnershipGuard)
async findOne(@Param('id') id: string) { ... }
```

---

## 3. AUTHORIZATION DECORATORS

### 3.1 @Roles() Decorator
📄 [metaiq-backend/src/common/decorators/roles.decorator.ts](metaiq-backend/src/common/decorators/roles.decorator.ts)

```typescript
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
```

- Sets metadata read by RolesGuard
- Applied at method or class level
- Multiple roles = OR condition (any will pass)

### 3.2 @CheckOwnership() Decorator
📄 [metaiq-backend/src/common/decorators/check-ownership.decorator.ts](metaiq-backend/src/common/decorators/check-ownership.decorator.ts)

```typescript
@CheckOwnership('campaign', 'id')
```

- Specifies resource type and parameter name
- Must be paired with `@UseGuards(OwnershipGuard)`

### 3.3 @CurrentUser() Decorator
📄 [metaiq-backend/src/common/decorators/current-user.decorator.ts](metaiq-backend/src/common/decorators/current-user.decorator.ts)

```typescript
async findAll(@CurrentUser() user: AuthenticatedUser) { ... }
```

- Extracts authenticated user from request
- Optional field extraction: `@CurrentUser('tenantId')`

---

## 4. ACCESS SCOPE SERVICE

**Location**: 📄 [metaiq-backend/src/common/services/access-scope.service.ts](metaiq-backend/src/common/services/access-scope.service.ts)

### Core Methods

#### Role Checking
```typescript
isAdmin(user): boolean
isPlatformAdmin(user): boolean
isManager(user): boolean
isOperational(user): boolean
isClient(user): boolean
```

#### Data Access Control

**`getAllowedStoreIds(user)`** - Returns accessible store IDs based on role:
- **PLATFORM_ADMIN**: `null` (all stores)
- **ADMIN/MANAGER**: All stores in their tenant
- **OPERATIONAL/CLIENT**: Only explicitly assigned stores (via UserStore table)

**`validateStoreAccess(user, storeId)`** - Throws error if:
- PLATFORM_ADMIN: No restriction
- ADMIN/MANAGER: Store must be in their tenantId
- OPERATIONAL/CLIENT: Must have UserStore link

**`validateTenantAccess(user, tenantId)`** - Ensures user's tenantId matches

**`applyCampaignScope(queryBuilder, alias, user)`** - Automatically scopes queries:
- **PLATFORM_ADMIN**: No filter
- **ADMIN/MANAGER**: Filter by `tenantId`
- **OPERATIONAL/CLIENT**: Filter by assigned storeIds OR own userId

---

## 5. META INTEGRATION ENDPOINTS (🔴 CRITICAL ISSUES)

### Controller Location
📄 [metaiq-backend/src/modules/integrations/meta/meta.controller.ts](metaiq-backend/src/modules/integrations/meta/meta.controller.ts)

### Route: `GET /integrations/meta/stores/:storeId/status`
```typescript
@Get('status')
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
getStatus(storeId, user) { ... }
```
**Status**: ✓ Correct (read-only, all roles allowed)

### Route: `GET /integrations/meta/stores/:storeId/oauth/start` 🔴
```typescript
@Get('oauth/start')
@Roles(Role.ADMIN, Role.MANAGER)
startOAuth(storeId, user) { ... }
```
**Issue**: MANAGER should NOT initiate OAuth/Meta connection  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)` or `@Roles(Role.PLATFORM_ADMIN, Role.OPERATIONAL)`

### Route: `GET /integrations/meta/stores/:storeId/sync-plan` 🔴
```typescript
@Get('sync-plan')
@Roles(Role.ADMIN, Role.MANAGER)
getSyncPlan(storeId, user) { ... }
```
**Issue**: MANAGER should NOT plan Meta syncs  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)` 

### Route: `GET /integrations/meta/stores/:storeId/ad-accounts` 🔴
```typescript
@Get('ad-accounts')
@Roles(Role.ADMIN, Role.MANAGER)
getAdAccounts(storeId, user) { ... }
```
**Issue**: MANAGER should NOT fetch ad accounts  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)`

### Route: `POST /integrations/meta/stores/:storeId/ad-accounts/sync` 🔴
```typescript
@Post('ad-accounts/sync')
@Roles(Role.ADMIN, Role.MANAGER)
syncAdAccounts(storeId, user) { ... }
```
**Issue**: MANAGER should NOT sync ad accounts  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)`

### Route: `GET /integrations/meta/stores/:storeId/ad-accounts/:adAccountId/campaigns` 🔴
```typescript
@Get('ad-accounts/:adAccountId/campaigns')
@Roles(Role.ADMIN, Role.MANAGER)
getCampaigns(storeId, adAccountId, user) { ... }
```
**Issue**: MANAGER should NOT fetch campaigns from Meta  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)`

### Route: `POST /integrations/meta/stores/:storeId/ad-accounts/:adAccountId/campaigns/sync` 🔴
```typescript
@Post('ad-accounts/:adAccountId/campaigns/sync')
@Roles(Role.ADMIN, Role.MANAGER)
syncCampaigns(storeId, adAccountId, user) { ... }
```
**Issue**: MANAGER should NOT sync campaigns from Meta  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)`

### Route: `POST /integrations/meta/stores/:storeId/connect` 🔴
```typescript
@Post('connect')
@Roles(Role.ADMIN, Role.MANAGER)
connect(storeId, user, dto) { ... }
```
**Issue**: MANAGER should NOT connect Meta integration  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)`

### Route: `PATCH /integrations/meta/stores/:storeId/status` 🔴
```typescript
@Patch('status')
@Roles(Role.ADMIN, Role.MANAGER)
updateStatus(storeId, user, dto) { ... }
```
**Issue**: MANAGER should NOT update integration status  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)`

### Route: `DELETE /integrations/meta/stores/:storeId` 🔴
```typescript
@Delete()
@Roles(Role.ADMIN, Role.MANAGER)
disconnect(storeId, user) { ... }
```
**Issue**: MANAGER should NOT disconnect Meta  
**Should be**: `@Roles(Role.ADMIN, Role.OPERATIONAL)`

### Service Layer Validation (🔴 CRITICAL)
📄 [metaiq-backend/src/modules/integrations/meta/meta.service.ts](metaiq-backend/src/modules/integrations/meta/meta.service.ts#L392)

```typescript
private async validateCanManage(storeId: string, user: AuthenticatedUser): Promise<void> {
  await this.accessScope.validateStoreAccess(user, storeId);
  if (![Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER].includes(user.role)) {
    throw new ForbiddenException('Apenas ADMIN ou MANAGER podem gerenciar integrações');
  }
}
```

**Issue**: Error message and validation allow MANAGER  
**Should be**: `[Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL]`  
**Message should be**: `'Apenas ADMIN ou OPERATIONAL podem gerenciar integrações'`

---

## 6. CAMPAIGN ENDPOINTS

### Controller Location
📄 [metaiq-backend/src/modules/campaigns/campaigns.controller.ts](metaiq-backend/src/modules/campaigns/campaigns.controller.ts)

### Endpoint Protection

```typescript
@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
export class CampaignsController {
  
  @Get()
  async findAll(user, query) { ... }
  
  @Get(':id')
  @CheckOwnership('campaign')
  @UseGuards(OwnershipGuard)
  async findOne(id, user) { ... }
  
  @Post()
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  async create(dto, user) { ... }
  
  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  @CheckOwnership('campaign')
  @UseGuards(OwnershipGuard)
  async update(id, dto, user) { ... }
}
```

**Status**: ✓ Appears correct
- All CRUD operations limited to ADMIN, MANAGER, OPERATIONAL
- OwnershipGuard ensures resource ownership
- No CLIENT (read-only) access to modify

---

## 7. AD ACCOUNT ENDPOINTS

### Controller Location
📄 [metaiq-backend/src/modules/ad-accounts/ad-accounts.controller.ts](metaiq-backend/src/modules/ad-accounts/ad-accounts.controller.ts)

### Analysis

#### GET (Read) Operations - ✓ Correct
```typescript
@Get()
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
async findByUser(user, storeId?) { ... }

@Get(':id')
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
@CheckOwnership('adAccount')
async findOne(id, user) { ... }
```

#### Create Operation - ⚠️ Questionable
```typescript
@Post()
@Roles(Role.ADMIN, Role.MANAGER)
async create(dto, user) { ... }
```
**Question**: Should OPERATIONAL be able to create ad accounts?  
**Current**: Only ADMIN, MANAGER

#### Update/Delete Operations - ⚠️ Questionable
```typescript
@Patch(':id')
@Roles(Role.ADMIN, Role.MANAGER)
@CheckOwnership('adAccount')
async update(id, dto, user) { ... }

@Delete(':id')
@Roles(Role.ADMIN, Role.MANAGER)
@CheckOwnership('adAccount')
async remove(id, user) { ... }
```
**Current**: Only ADMIN, MANAGER  
**Decision needed**: Can OPERATIONAL manage ad accounts?

---

## 8. STORE MANAGEMENT ENDPOINTS

### Controller Location
📄 [metaiq-backend/src/modules/stores/stores.controller.ts](metaiq-backend/src/modules/stores/stores.controller.ts)

### Analysis

```typescript
@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)  // 🔴 Entire controller restricted
export class StoresController {
  
  @Post()
  create(req, dto) { ... }
  
  @Get()
  findAll(req) { ... }
  
  @Get('accessible')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)  // Opens here
  findAccessible(req) { ... }
  
  @Get(':storeId/users')
  listUsers(storeId, req) { ... }
  
  @Post(':storeId/users/:userId')
  linkUser(storeId, userId, req) { ... }
  
  @Delete(':storeId/users/:userId')
  unlinkUser(storeId, userId, req) { ... }
  
  @Get(':id')
  findOne(id, req) { ... }
  
  @Patch(':id')
  update(id, req, dto) { ... }
  
  @Patch(':id/toggle-active')
  toggleActive(id, req) { ... }
}
```

**Issues**:
- 🔴 Entire controller restricted to ADMIN, MANAGER
- OPERATIONAL cannot create/read stores even via `/accessible`
- Only way to view stores: `GET /stores/accessible` override
- Store user management (linking) restricted to ADMIN, MANAGER

**Status**: Possible issue depending on business rules

---

## 9. USER MANAGEMENT ENDPOINTS

### Controller Location
📄 [metaiq-backend/src/modules/users/users.controller.ts](metaiq-backend/src/modules/users/users.controller.ts)

### Endpoint Analysis

```typescript
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  
  @Get('me')
  getCurrentUser(req) { ... }  // No guard - all users
  
  @Patch('me')
  updateCurrentUser(req, dto) { ... }  // No guard - can update own profile
  
  @Delete('me')
  deleteCurrentUser(req) { ... }  // No guard - can delete own account
  
  @Get(':id')
  findOne(id, req) { ... }  // No role guard
  
  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  updateUser(id, req, dto) { ... }  // ADMIN can update others
  
  @Patch(':id/password')
  @Roles(Role.ADMIN)
  resetUserPassword(id, req, dto) { ... }  // Admin-only password reset
}
```

**Observation**: MANAGER can update other users' profiles - verify if intended

---

## 10. MANAGER MANAGEMENT ENDPOINTS

### Controller Location
📄 [metaiq-backend/src/modules/managers/managers.controller.ts](metaiq-backend/src/modules/managers/managers.controller.ts)

```typescript
@Controller('managers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN)
export class ManagersController {
  @Post() create(dto) { ... }
  @Get() findAll(req) { ... }
  @Get(':id') findOne(id) { ... }
  @Patch(':id') update(id, dto) { ... }
  @Patch(':id/toggle-active') toggleActive(id) { ... }
}
```

**Status**: ✓ Correct  
- Only PLATFORM_ADMIN and ADMIN can manage Manager entities
- MANAGER cannot manage other managers

---

## 11. INSIGHTS ENDPOINTS

### Controller Location
📄 [metaiq-backend/src/modules/insights/insights.controller.ts](metaiq-backend/src/modules/insights/insights.controller.ts)

```typescript
@Controller('insights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsightsController {
  
  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  async findAll(user, filters) { ... }  // All can read
  
  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
  @CheckOwnership('insight')
  @UseGuards(OwnershipGuard)
  async findOne(id, user) { ... }  // All can read specific
  
  @Patch(':id/resolve')
  @Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
  @CheckOwnership('insight')
  @UseGuards(OwnershipGuard)
  async resolve(id, user) { ... }  // Only ADMIN/MANAGER/OPERATIONAL can resolve
}
```

**Status**: ✓ Correct
- CLIENT (read-only) cannot modify/resolve
- Others can resolve issues

---

## 12. DASHBOARD ENDPOINTS

### Controller Location
📄 [metaiq-backend/src/modules/dashboard/dashboard.controller.ts](metaiq-backend/src/modules/dashboard/dashboard.controller.ts)

```typescript
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
export class DashboardController {
  
  @Get('summary')
  getSummary(user, query) { ... }
}
```

**Status**: ✓ Correct  
- All authenticated users can view dashboard
- Data scoped by `AccessScopeService`

---

## 13. GUARD EXECUTION FLOW

### Typical Endpoint Guard Chain

```typescript
@Get(':id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPERATIONAL)
@CheckOwnership('campaign')
@UseGuards(OwnershipGuard)
async getCampaign(@Param('id') id, @CurrentUser() user) { ... }
```

**Execution Order** (per NestJS):
1. **JwtAuthGuard**: Validates JWT token → extracts user
2. **RolesGuard**: Checks if user role in @Roles() → throws ForbiddenException if not
3. **OwnershipGuard**: Validates user owns resource → throws ForbiddenException if not
4. **Handler executed**: If all guards pass

**Data Isolation**: Applied at multiple layers:
- Guard level: Role validation
- Guard level: Resource ownership
- Service level: Query scope filtering (AccessScopeService)

---

## 14. MULTI-TENANT DATA ISOLATION

### Tenant Scoping in AccessScopeService

#### For ADMIN/MANAGER Users
```typescript
if (this.isAdmin(user) || this.isManager(user)) {
  if (!user.tenantId) return [];
  
  const stores = await this.storeRepository.find({
    where: { tenantId: user.tenantId, active: true }
  });
  return stores.map(s => s.id);
}
```
- Can only access stores in their **tenantId**
- No cross-tenant data access

#### For OPERATIONAL/CLIENT Users
```typescript
const links = await this.userStoreRepository.find({
  where: { userId: user.id }
});
return links.map(link => link.storeId);
```
- Can only access stores explicitly linked in **UserStore table**
- No tenant-wide access

#### Query-Level Scoping
```typescript
async applyCampaignScope(query, alias, user) {
  if (this.isPlatformAdmin(user)) return query;  // No filter
  
  if (this.isAdmin(user) || this.isManager(user)) {
    return query.andWhere(
      `${alias}_scopeStore.tenantId = :scopeTenantId`,
      { scopeTenantId: user.tenantId }
    );
  }
  
  // OPERATIONAL/CLIENT: by assigned storeIds
  return query.andWhere(
    `${alias}.storeId IN (:...scopeStoreIds)`,
    { scopeStoreIds: storeIds }
  );
}
```

---

## 15. SUMMARY TABLE: ENDPOINT AUTHORIZATION

| Endpoint | GET | POST | PATCH | DELETE | Status |
|----------|-----|------|-------|--------|--------|
| **Meta Integration** | | | | | |
| `/integrations/meta/stores/:id/oauth/start` | ADMIN, MANAGER | - | - | - | 🔴 Issue |
| `/integrations/meta/stores/:id/ad-accounts/sync` | - | ADMIN, MANAGER | - | - | 🔴 Issue |
| **Campaigns** | | | | | |
| `/campaigns` | ADMIN, MGR, OPS | ADMIN, MGR, OPS | - | - | ✓ OK |
| `/campaigns/:id` | All (OG) | - | ADMIN, MGR, OPS | - | ✓ OK |
| **Ad Accounts** | | | | | |
| `/ad-accounts` | ADMIN, MGR, OPS | ADMIN, MANAGER | - | - | ⚠️ |
| **Stores** | | | | | |
| `/stores` | ADMIN, MANAGER | ADMIN, MANAGER | - | - | ⚠️ |
| `/stores/accessible` | ADMIN, MGR, OPS, CLIENT | - | - | - | ✓ OK |
| **Dashboard** | | | | | |
| `/dashboard/summary` | All Users | - | - | - | ✓ OK |
| **Managers** | | | | | |
| `/managers` | ADMIN | ADMIN | - | - | ✓ OK |

---

## CRITICAL ISSUES TO FIX

### 🔴 Priority 1: Meta Integration Endpoints

**All Meta integration endpoints currently allow MANAGER but should allow OPERATIONAL instead**

**Files to modify**:
1. [metaiq-backend/src/modules/integrations/meta/meta.controller.ts](metaiq-backend/src/modules/integrations/meta/meta.controller.ts)
   - Change 9 endpoints from `@Roles(Role.ADMIN, Role.MANAGER)` to `@Roles(Role.ADMIN, Role.OPERATIONAL)`

2. [metaiq-backend/src/modules/integrations/meta/meta.service.ts](metaiq-backend/src/modules/integrations/meta/meta.service.ts#L392)
   - Update `validateCanManage()` method
   - Replace `Role.MANAGER` with `Role.OPERATIONAL`
   - Update error message

### 🟡 Priority 2: Ad Accounts Creation

**Verify if OPERATIONAL should create ad accounts**
- Current: ADMIN, MANAGER only
- Decision needed before fixing

### 🟡 Priority 3: Store Management

**Verify OPERATIONAL access to store management**
- Current: ADMIN, MANAGER only
- Consider if OPERATIONAL needs read/write access

---

## TESTING RECOMMENDATIONS

### Role-Based Access Tests
1. ✓ OPERATIONAL can start Meta OAuth
2. ✓ MANAGER cannot start Meta OAuth (403 Forbidden)
3. ✓ ADMIN can always access Meta integration
4. ✓ PLATFORM_ADMIN bypasses all guards
5. ✓ CLIENT cannot access Meta endpoints
6. ✓ Cross-tenant users cannot access other stores

### Multi-Tenant Tests
1. ✓ ADMIN/MANAGER see only stores in their tenantId
2. ✓ OPERATIONAL/CLIENT see only explicitly assigned stores
3. ✓ Data queries automatically scoped by AccessScopeService

---

## RECOMMENDATIONS

1. **Fix Meta Integration immediately** - MANAGER currently has unauthorized access
2. **Document business rules** - Create role-permission matrix
3. **Add integration tests** - Verify role-based access at endpoint level
4. **Frontend alignment** - Ensure UI matches backend authorization
5. **Audit logs** - Add logging for sensitive operations (Meta integration)
6. **Regular reviews** - Audit authorization changes in code reviews

---

## APPENDIX: Key Files Reference

| File | Purpose |
|------|---------|
| [role.enum.ts](metaiq-backend/src/common/enums/role.enum.ts) | Role definitions |
| [roles.guard.ts](metaiq-backend/src/common/guards/roles.guard.ts) | Role validation guard |
| [roles.decorator.ts](metaiq-backend/src/common/decorators/roles.decorator.ts) | @Roles() decorator |
| [access-scope.service.ts](metaiq-backend/src/common/services/access-scope.service.ts) | Multi-tenant data scoping |
| [meta.controller.ts](metaiq-backend/src/modules/integrations/meta/meta.controller.ts) | 🔴 Meta endpoints - CRITICAL ISSUES |
| [meta.service.ts](metaiq-backend/src/modules/integrations/meta/meta.service.ts) | 🔴 Meta validation - CRITICAL ISSUE |
| [campaigns.controller.ts](metaiq-backend/src/modules/campaigns/campaigns.controller.ts) | Campaign endpoints |
| [ad-accounts.controller.ts](metaiq-backend/src/modules/ad-accounts/ad-accounts.controller.ts) | Ad account endpoints |
| [stores.controller.ts](metaiq-backend/src/modules/stores/stores.controller.ts) | Store management |
| [users.controller.ts](metaiq-backend/src/modules/users/users.controller.ts) | User management |

---

**Audit completed**: April 16, 2026
