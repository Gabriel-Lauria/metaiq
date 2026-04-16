# Campaign Endpoints & Role-Based Authorization Audit

**Date:** April 16, 2026  
**Status:** ⚠️ CRITICAL ISSUES FOUND

---

## Executive Summary

The Campaign module contains **critical authorization misconfigurations** where `MANAGER` role is allowed to perform write operations (CREATE, UPDATE, PAUSE, RESUME) on campaigns. According to role definitions, only `OPERATIONAL` and `PLATFORM_ADMIN` should have these permissions.

---

## Campaign Controller Analysis

**File:** [metaiq-backend/src/modules/campaigns/campaigns.controller.ts](metaiq-backend/src/modules/campaigns/campaigns.controller.ts)

### Class-Level Authorization
```typescript
@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
export class CampaignsController {
```

Default roles: `ADMIN, MANAGER, OPERATIONAL` (permits all 3 roles by default)

---

## Endpoint Breakdown

### 1. ❌ GET /campaigns (LIST)
**Location:** [campaigns.controller.ts:28-35](metaiq-backend/src/modules/campaigns/campaigns.controller.ts#L28-L35)

```typescript
@Get()
async findAll(
  @CurrentUser() user: AuthenticatedUser,
  @Query() query: CampaignQueryDto,
): Promise<PaginatedResponse<Campaign>> {
  return this.campaignsService.findAllPaginated(user, query, { storeId: query.storeId });
}
```

**Current Roles:** ADMIN, MANAGER, OPERATIONAL (inherits from class)  
**Should Allow:** ADMIN, MANAGER, OPERATIONAL, CLIENT ✓ (with store scoping)  
**Status:** ✅ CORRECT (but could add CLIENT explicitly)  
**Authorization Method:** `applyCampaignScope()` in service handles store/tenant filtering

---

### 2. ❌ GET /campaigns/:id (READ SINGLE)
**Location:** [campaigns.controller.ts:37-45](metaiq-backend/src/modules/campaigns/campaigns.controller.ts#L37-L45)

```typescript
@Get(':id')
@CheckOwnership('campaign')
@UseGuards(OwnershipGuard)
async findOne(
  @Param('id') id: string,
  @CurrentUser() user: AuthenticatedUser,
) {
  return this.campaignsService.findOne(id, user);
}
```

**Current Roles:** ADMIN, MANAGER, OPERATIONAL (inherits from class)  
**Should Allow:** ADMIN, MANAGER, OPERATIONAL, CLIENT ✓ (with ownership check)  
**Status:** ✅ CORRECT with OwnershipGuard  
**Authorization Method:** `applyCampaignScope()` + OwnershipGuard

---

### 3. 🔴 POST /campaigns (CREATE) - **CRITICAL ISSUE**
**Location:** [campaigns.controller.ts:47-55](metaiq-backend/src/modules/campaigns/campaigns.controller.ts#L47-L55)

```typescript
@Post()
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
async create(
  @Body() dto: CreateCampaignDto,
  @CurrentUser() user: AuthenticatedUser,
): Promise<Campaign> {
  return this.campaignsService.create(dto, user);
}
```

**Current Roles:** `ADMIN, MANAGER, OPERATIONAL`  
**Should Allow:** `OPERATIONAL, PLATFORM_ADMIN` only  
**Status:** 🔴 **CRITICAL** - MANAGER should NOT be able to create campaigns  
**What CREATE does:**
- Validates store access via `accessScope.validateStoreAccess()`
- Validates ad account is in store
- Creates campaign with store/user/account assignment

**Why This Is Wrong:**
- MANAGER is a supervisor role - should NOT integrate with Meta
- Only OPERATIONAL (executor) and PLATFORM_ADMIN (super admin) should create campaigns
- MANAGER should only review and approve (read operations)

---

### 4. 🔴 PATCH /campaigns/:id (UPDATE/PAUSE/RESUME) - **CRITICAL ISSUE**
**Location:** [campaigns.controller.ts:57-66](metaiq-backend/src/modules/campaigns/campaigns.controller.ts#L57-L66)

```typescript
@Patch(':id')
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
@CheckOwnership('campaign')
@UseGuards(OwnershipGuard)
async update(
  @Param('id') id: string,
  @Body() dto: UpdateCampaignDto,
  @CurrentUser() user: AuthenticatedUser,
): Promise<Campaign> {
  return this.campaignsService.update(id, user, dto);
}
```

**Current Roles:** `ADMIN, MANAGER, OPERATIONAL`  
**Should Allow:** `OPERATIONAL, PLATFORM_ADMIN` only  
**Status:** 🔴 **CRITICAL** - MANAGER should NOT be able to update/pause/resume campaigns

**What UPDATE allows (via UpdateCampaignDto):**
- Change `status` → ACTIVE, PAUSED, ARCHIVED (controls pause/resume)
- Change `name`, `objective`, `dailyBudget`, `endTime`
- Change `storeId`, `adAccountId` (move campaign)

**UpdateCampaignDto Fields:**
```typescript
export class UpdateCampaignDto {
  @IsOptional() name?: string;
  @IsOptional() status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';  // ← Pause/Resume
  @IsOptional() objective?: 'CONVERSIONS' | 'REACH' | 'TRAFFIC' | 'LEADS';
  @IsOptional() dailyBudget?: number;
  @IsOptional() endTime?: string;
  @IsOptional() storeId?: string;
  @IsOptional() adAccountId?: string;
}
```

**Why This Is Wrong:**
- MANAGER should NOT have write access to Meta campaign operations
- All campaign control (pause, resume, budget, objective) should be OPERATIONAL only
- MANAGER's role is supervisory/approval, not operational execution

---

## Campaign Service Authorization

**File:** [metaiq-backend/src/modules/campaigns/campaigns.service.ts](metaiq-backend/src/modules/campaigns/campaigns.service.ts)

### `create()` Method
**Location:** [campaigns.service.ts:16-35](metaiq-backend/src/modules/campaigns/campaigns.service.ts#L16-L35)

**Authorization Flow:**
1. `validateStoreAccess()` - checks user has access to store
2. `validateAdAccountInStore()` - checks ad account belongs to store
3. Creates campaign with `userId` and `createdByUserId`

**Issue:** No role-based check - relies entirely on controller @Roles decorator

---

### `update()` Method
**Location:** [campaigns.service.ts:37-54](metaiq-backend/src/modules/campaigns/campaigns.service.ts#L37-L54)

**Authorization Flow:**
1. `findOne()` - retrieves campaign with scope check
2. `validateStoreAccess()` - if store is being changed
3. `validateAdAccountInStore()` - if ad account is being changed
4. Updates campaign

**Issue:** No role-based check - relies entirely on controller @Roles decorator

---

### `findAllPaginated()` / `findAll()` / `findOne()`
**Location:** [campaigns.service.ts:56-120](metaiq-backend/src/modules/campaigns/campaigns.service.ts#L56-L120)

**Authorization via `applyCampaignScope()`:**
- PLATFORM_ADMIN: sees all campaigns
- ADMIN/MANAGER: sees campaigns in their tenant
- OPERATIONAL/CLIENT: sees campaigns in their assigned stores + own campaigns

This uses [AccessScopeService.applyCampaignScope()](metaiq-backend/src/common/services/access-scope.service.ts#L110)

**Status:** ✅ Proper scoping implemented

---

## Authorization Rules - Current vs Required

| Operation | Endpoint | Current Roles | Required Roles | Status |
|-----------|----------|---------------|----------------|--------|
| **LIST** | `GET /campaigns` | ADMIN, MANAGER, OPERATIONAL | ADMIN, MANAGER, OPERATIONAL, CLIENT | ✅ OK* |
| **READ** | `GET /campaigns/:id` | ADMIN, MANAGER, OPERATIONAL | ADMIN, MANAGER, OPERATIONAL, CLIENT | ✅ OK* |
| **CREATE** | `POST /campaigns` | ADMIN, MANAGER, OPERATIONAL | OPERATIONAL, PLATFORM_ADMIN | 🔴 WRONG |
| **UPDATE** | `PATCH /campaigns/:id` | ADMIN, MANAGER, OPERATIONAL | OPERATIONAL, PLATFORM_ADMIN | 🔴 WRONG |
| **PAUSE** | `PATCH /campaigns/:id` (status) | ADMIN, MANAGER, OPERATIONAL | OPERATIONAL, PLATFORM_ADMIN | 🔴 WRONG |
| **RESUME** | `PATCH /campaigns/:id` (status) | ADMIN, MANAGER, OPERATIONAL | OPERATIONAL, PLATFORM_ADMIN | 🔴 WRONG |

*CLIENT role missing in explicit @Roles but works via store scoping

---

## Role Enum Reference

**File:** [metaiq-backend/src/common/enums/role.enum.ts](metaiq-backend/src/common/enums/role.enum.ts)

```typescript
export enum Role {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',  // Super admin - full platform access
  ADMIN = 'ADMIN',                    // Tenant/org admin
  MANAGER = 'MANAGER',                // Supervisor - no Meta integration
  OPERATIONAL = 'OPERATIONAL',        // Executor - can integrate with Meta
  CLIENT = 'CLIENT',                  // Read-only access to own store
}
```

**Note:** Campaign controller uses `ADMIN` instead of `PLATFORM_ADMIN` in its @Roles decorators

---

## Recommended Fixes

### Fix 1: Campaign CREATE Endpoint
**File:** [campaigns.controller.ts:47-55](metaiq-backend/src/modules/campaigns/campaigns.controller.ts#L47-L55)

**Change:**
```typescript
@Post()
@Roles(Role.OPERATIONAL, Role.PLATFORM_ADMIN)  // ← FIX: Remove MANAGER
async create(
```

---

### Fix 2: Campaign UPDATE Endpoint
**File:** [campaigns.controller.ts:57-66](metaiq-backend/src/modules/campaigns/campaigns.controller.ts#L57-L66)

**Change:**
```typescript
@Patch(':id')
@Roles(Role.OPERATIONAL, Role.PLATFORM_ADMIN)  // ← FIX: Remove MANAGER
@CheckOwnership('campaign')
@UseGuards(OwnershipGuard)
async update(
```

---

### Fix 3: Campaign LIST/READ Endpoints (Optional - for clarity)
**File:** [campaigns.controller.ts:28-45](metaiq-backend/src/modules/campaigns/campaigns.controller.ts#L28-L45)

**Change (for clarity, current works via scoping):**
```typescript
@Get()
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)  // ← Add CLIENT explicitly
async findAll(
```

And:
```typescript
@Get(':id')
@Roles(Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)  // ← Add CLIENT explicitly
```

---

## Similar Issues in Other Modules

Based on this pattern, check these modules for the same MANAGER over-permission issue:

- **Ad Accounts Controller** - `@Roles(Role.ADMIN, Role.MANAGER)` on CREATE/UPDATE/DELETE
  - File: [metaiq-backend/src/modules/ad-accounts/ad-accounts.controller.ts](metaiq-backend/src/modules/ad-accounts/ad-accounts.controller.ts#L65-L94)
  - Lines 65, 78, 94 - all should be `OPERATIONAL, PLATFORM_ADMIN` only

- **Integrations Module** - likely has same issue
  - Check create/sync endpoints

---

## Validation Checklist

- [ ] Update Campaign CREATE endpoint - remove MANAGER
- [ ] Update Campaign UPDATE endpoint - remove MANAGER
- [ ] Add CLIENT role to LIST/READ endpoints (explicit, for clarity)
- [ ] Check Ad Accounts controller for same MANAGER issue
- [ ] Check Integrations controller for same MANAGER issue
- [ ] Update AccessScopeService if needed for CLIENT scoping
- [ ] Test authorization with each role
- [ ] Update frontend to hide/disable write operations for MANAGER
- [ ] Document role hierarchy in code comments

---

## Access Scope Service Reference

**File:** [metaiq-backend/src/common/services/access-scope.service.ts](metaiq-backend/src/common/services/access-scope.service.ts)

**Key Methods:**
- `isPlatformAdmin()` - checks PLATFORM_ADMIN role
- `isAdmin()` - checks ADMIN role
- `isManager()` - checks MANAGER role
- `isOperational()` - checks OPERATIONAL role
- `isClient()` - checks CLIENT role
- `validateStoreAccess()` - validates user can access store
- `applyCampaignScope()` - applies query scoping for campaigns
- `getAllowedStoreIds()` - gets stores user can access

**Note:** No `validateCanManageCampaigns()` method found - authorization is purely role-based at controller level

---

## Summary

**Critical Security Issue:** MANAGER role can create, update, and pause/resume Meta Ad campaigns when they should have read-only access. Only OPERATIONAL and PLATFORM_ADMIN should have write permissions on campaigns.

**Impact:** MANAGER users can execute operational Meta Ad campaign changes, violating the intended role separation where MANAGER = supervisor (no Meta integration) and OPERATIONAL = executor.

**Fix Complexity:** Low - 2 simple @Roles decorator changes
