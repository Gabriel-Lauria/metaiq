# Permissions Matrix

Phase 3 applies backend role checks plus tenant/store data scoping. The frontend is only a UX layer; backend guards and scoped queries are authoritative.

| Area | Endpoint | Public | ADMIN | MANAGER | OPERATIONAL | CLIENT | Scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | `POST /auth/login` | Yes | Yes | Yes | Yes | Yes | Inactive users are rejected. |
| Auth | `POST /auth/register` | Yes | Yes | Yes | Yes | Yes | Self-service users default to `OPERATIONAL`. |
| Auth | `POST /auth/refresh` | Yes | Yes | Yes | Yes | Yes | Requires valid refresh token and active user. |
| Users | `GET /users/me` | No | Yes | Yes | Yes | Yes | Current user only. |
| Users | `PATCH /users/me` | No | Yes | Yes | Yes | Yes | Current user only. |
| Users | `DELETE /users/me` | No | Yes | Yes | Yes | Yes | Current user only. |
| Users | `GET /users/:id` | No | Yes | Tenant users | Own user only | Own user only | Manager filtered by `managerId`. |
| Users | `GET /users` | No | Yes | Tenant users | No | No | Manager filtered by `managerId`. |
| Campaigns | `GET /campaigns` | No | Yes | Tenant stores | Assigned stores | No | Store scope via `stores.managerId` or `user_stores`. |
| Campaigns | `GET /campaigns/:id` | No | Yes | Tenant stores | Assigned stores | No | Store scope via `stores.managerId` or `user_stores`. |
| Ad Accounts | `GET /ad-accounts` | No | Yes | Tenant stores | Assigned stores | No | Store scope via `stores.managerId` or `user_stores`. |
| Ad Accounts | `GET /ad-accounts/:id` | No | Yes | Tenant stores | Assigned stores | No | Store scope via `stores.managerId` or `user_stores`. |
| Ad Accounts | `POST /ad-accounts` | No | Yes | Tenant stores | No | No | `storeId` is validated before create. |
| Ad Accounts | `PATCH /ad-accounts/:id` | No | Yes | Tenant stores | No | No | Existing resource and target `storeId` are validated. |
| Ad Accounts | `DELETE /ad-accounts/:id` | No | Yes | Tenant stores | No | No | Existing resource scope is validated. |
| Metrics | `GET /metrics*` | No | Yes | Tenant stores | Assigned stores | Assigned stores | Campaign store scope is applied. |
| Insights | `GET /insights*` | No | Yes | Tenant stores | Assigned stores | Assigned stores | Campaign store scope is applied. |
| Insights | `PATCH /insights/:id/resolve` | No | Yes | Tenant stores | Assigned stores | No | Existing insight campaign scope is validated. |
