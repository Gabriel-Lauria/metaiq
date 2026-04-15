# MetaIQ Permissions Matrix

## Role Scope

| Role | Tenant scope | Store scope | Notes |
| --- | --- | --- | --- |
| ADMIN | All managers | All stores | Full system access. |
| MANAGER | Own `managerId` only | Stores where `store.managerId = user.managerId` | Can manage tenant resources. |
| OPERATIONAL | Own `managerId` context | Stores linked through `user_stores` | Can read and operate assigned stores only. |
| CLIENT | Own `managerId` context | Stores linked through `user_stores` | Dashboard/insight read only. No operational writes. |

## Endpoint Rules

| Area | ADMIN | MANAGER | OPERATIONAL | CLIENT |
| --- | --- | --- | --- | --- |
| `GET /users/me` | Allowed | Allowed | Allowed | Allowed |
| `GET /users` | All users | Own tenant users | Blocked | Blocked |
| `GET /users/:id` | Any user | Own tenant users | Self only | Self only |
| `POST /users` | Any valid role and tenant | Own tenant only, `OPERATIONAL`/`CLIENT` only | Blocked | Blocked |
| `PATCH /users/:id/password` | Reset any user password | Blocked | Blocked | Blocked |
| `GET /campaigns` | All campaigns | Own tenant stores and legacy tenant campaigns | Assigned stores and own legacy campaigns | Blocked |
| `POST/PATCH /campaigns` | Any valid store | Own tenant store | Assigned store | Blocked |
| `GET /ad-accounts` | All accounts | Own tenant stores and legacy tenant accounts | Assigned stores and own legacy accounts | Blocked |
| `POST/PATCH/DELETE /ad-accounts` | Any valid store/account | Own tenant store/account | Blocked | Blocked |
| `POST/GET/PATCH /managers` | Allowed | Blocked | Blocked | Blocked |
| `PATCH /managers/:id/toggle-active` | Allowed | Blocked | Blocked | Blocked |
| `POST/GET/PATCH /stores` | All stores and tenants | Own tenant only | Blocked | Blocked |
| `GET /stores/accessible` | Active stores | Own active tenant stores | Assigned active stores | Assigned active stores |
| `PATCH /stores/:id/toggle-active` | Any store | Own tenant only | Blocked | Blocked |
| `GET /stores/:storeId/users` | Any valid store | Own tenant store only | Blocked | Blocked |
| `POST/DELETE /stores/:storeId/users/:userId` | Same-tenant user/store only | Own tenant user/store only | Blocked | Blocked |
| `GET /metrics/*` | All metrics | Own tenant stores and legacy tenant campaigns | Assigned stores and own legacy campaigns | Assigned stores and own legacy campaigns |
| `GET /dashboard/summary` | Scoped aggregate summary | Own tenant aggregate summary | Assigned store summary | Assigned store executive summary |
| `GET /insights/*` | All insights | Own tenant stores and legacy tenant campaigns | Assigned stores and own legacy campaigns | Assigned stores and own legacy campaigns |
| `PATCH /insights/:id/resolve` | Allowed | Own tenant scope | Assigned store scope | Blocked |

## Transition Rules

- New `Campaign` and `AdAccount` writes must include `storeId`.
- `storeId` is validated server-side; frontend-provided IDs are never trusted.
- `storeId` filters on campaigns, ad accounts, metrics, and insights are validated server-side and do not include legacy `storeId = null` records.
- Legacy `userId` remains for compatibility and audit during transition.
- Legacy resources without `storeId` are readable only through fallback scope:
  - ADMIN: all.
  - MANAGER: owner user's `managerId`.
  - OPERATIONAL/CLIENT: own `userId`.
- Future hardening should backfill `storeId`, add database FKs, then make `storeId` non-null.

## Management Rules

- `MANAGER` never controls `managerId` through payload; backend uses the authenticated user's `managerId`.
- `MANAGER` can create only `OPERATIONAL` and `CLIENT` users.
- User-store links require `user.managerId = store.managerId`; cross-tenant links are blocked even for valid IDs.
- `ADMIN` can manage all managers and stores, but user-store links still require a coherent tenant relationship.
