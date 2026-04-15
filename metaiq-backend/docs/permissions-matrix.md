# Permissions Matrix

Phase 1 defines coarse role access only. Tenant and store scoping will be added in Phase 2.

| Area | Endpoint | Public | ADMIN | MANAGER | OPERATIONAL | CLIENT | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | `POST /auth/login` | Yes | Yes | Yes | Yes | Yes | Throttled. Inactive users are rejected. |
| Auth | `POST /auth/register` | Yes | Yes | Yes | Yes | Yes | Current self-service default role is `OPERATIONAL`. |
| Auth | `POST /auth/refresh` | Yes | Yes | Yes | Yes | Yes | Requires valid stored refresh token and active user. |
| Users | `GET /users/me` | No | Yes | Yes | Yes | Yes | Returns current authenticated user. |
| Users | `PATCH /users/me` | No | Yes | Yes | Yes | Yes | Self profile update only. |
| Users | `DELETE /users/me` | No | Yes | Yes | Yes | Yes | Deactivates current user. |
| Users | `GET /users/:id` | No | Yes | Yes | Own user only | Own user only | Admin/manager can inspect users in Phase 1. |
| Users | `GET /users` | No | Yes | Yes | No | No | Listing is restricted. |
| Campaigns | `GET /campaigns` | No | Yes | Yes | Yes | No | CLIENT must use dashboard/metrics views only. |
| Campaigns | `GET /campaigns/:id` | No | Yes | Yes | Yes | No | Ownership still applies through service filters. |
| Ad Accounts | `GET /ad-accounts` | No | Yes | Yes | Yes | Yes | Read remains available for existing flows. |
| Ad Accounts | `GET /ad-accounts/:id` | No | Yes | Yes | Yes | Yes | Ownership still applies through service filters. |
| Ad Accounts | `POST /ad-accounts` | No | Yes | Yes | No | No | Create restricted to admin/manager. |
| Ad Accounts | `PATCH /ad-accounts/:id` | No | Yes | Yes | No | No | Update restricted to admin/manager. |
| Ad Accounts | `DELETE /ad-accounts/:id` | No | Yes | Yes | No | No | Delete/deactivate restricted to admin/manager. |
| Metrics | `GET /metrics*` | No | Yes | Yes | Yes | Yes | Data scoping remains user-based until tenant/store phase. |
| Insights | `GET /insights*` | No | Yes | Yes | Yes | Yes | Data scoping remains user-based until tenant/store phase. |
| Insights | `PATCH /insights/:id/resolve` | No | Yes | Yes | Yes | No | Should be restricted before CLIENT workflows are exposed. |
