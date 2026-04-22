# 🚀 METAIQ BACKEND - PRODUCTION READINESS CHECKLIST

## Pre-Deployment Validation

### 1. Database Configuration

- [ ] `DB_TYPE=postgres` (MUST be postgres in production)
- [ ] PostgreSQL connection tested and accessible
- [ ] SSL enabled: `POSTGRES_SSL=true` or `DB_URL` with `?ssl=require`
- [ ] Database backups configured
- [ ] Migrations tested: `npm run migration:show` and `npm run migration:run`
- [ ] `TYPEORM_SYNCHRONIZE=false` (prevent auto-schema changes)
- [ ] `TYPEORM_MIGRATIONS_RUN=false` or automated via deployment

### 2. Secrets & Environment Variables

- [ ] All secrets in `.env` changed from default values
- [ ] Required secrets set:
  - [ ] `JWT_SECRET` (48+ random chars)
  - [ ] `JWT_REFRESH_SECRET` (48+ random chars)
  - [ ] `CRYPTO_SECRET` (exactly 32 bytes / 64 hex chars)
  - [ ] `META_APP_SECRET` (from Meta Developer account)
  - [ ] `GEMINI_API_KEY` (from Google AI Studio)
- [ ] `.env` file NOT committed to git
- [ ] Secrets managed via:
  - [ ] Environment variables from secret manager (AWS Secrets, HashiCorp Vault, etc)
  - [ ] Docker secrets
  - [ ] Kubernetes secrets
- [ ] `NODE_ENV=production` set

### 3. Application Security

- [ ] CORS origins configured correctly (no `*`)
- [ ] CORS credentials enabled: `credentials: true`
- [ ] Helmet.js headers active (CSP, HSTS)
- [ ] HSTS max-age appropriate (31536000 = 1 year minimum)
- [ ] Rate limiting configured:
  - [ ] Global: 5000 req/min
  - [ ] Auth login: 20 req/min per IP
  - [ ] Auth refresh: 60 req/min per IP
- [ ] Cookies secure:
  - [ ] `secure: true` for HTTPS only
  - [ ] `httpOnly: true` to prevent XSS theft
  - [ ] `sameSite: 'Strict'` for CSRF protection
- [ ] HTTPS enforced (redirect HTTP → HTTPS)

### 4. Logging & Observability

- [ ] Structured logging enabled
- [ ] Logs sent to centralized system (CloudWatch, ELK, Datadog, etc)
- [ ] Log levels appropriate (INFO in prod, DEBUG only in dev)
- [ ] No sensitive data in logs (passwords, tokens, PII)
- [ ] Request IDs tracked for distributed tracing
- [ ] Error tracking configured (Sentry, DataDog, New Relic)

### 5. Audit Trail

- [ ] Audit events logged for:
  - [ ] User login (success/failure)
  - [ ] Token refresh
  - [ ] User logout
  - [ ] Administrative actions (create/update/delete users, stores)
  - [ ] Cross-tenant access by PLATFORM_ADMIN
- [ ] Audit logs sent to separate storage (immutable log stream)
- [ ] Audit retention policy > 90 days minimum

### 6. Health & Readiness

- [ ] `/api/health` endpoint responds 200 OK
- [ ] `/api/ready` endpoint responds 200 only when DB is healthy
- [ ] Health checks do NOT perform expensive operations
- [ ] Readiness check includes database connectivity test
- [ ] Load balancer configured to use `/api/ready` for routing decisions

### 7. API & Database

- [ ] All endpoints require authentication (except `/auth/login`, `/auth/register`)
- [ ] Role-based access control (RBAC) enforced on sensitive endpoints
- [ ] Ownership guards prevent cross-tenant data access
- [ ] API versioning strategy documented
- [ ] Rate limiting protects against abuse
- [ ] Input validation active (class-validator)
- [ ] Error responses don't leak internal details

### 8. Meta Integration

- [ ] Meta OAuth redirect URI matches production domain
- [ ] `META_APP_ID` and `META_APP_SECRET` from production Meta app
- [ ] Meta token encryption working (uses `CRYPTO_SECRET`)
- [ ] Sync cron jobs configured and monitored
- [ ] Rate limit handling for Meta API failures implemented
- [ ] Campaign recovery system tested

### 9. Deployment & Monitoring

- [ ] Docker image built and tested
- [ ] Health checks configured in orchestrator (Kubernetes, ECS, etc)
- [ ] Alerting configured for:
  - [ ] High error rates (> 5%)
  - [ ] Database connection failures
  - [ ] API response time (> 5s)
  - [ ] Rate limit breaches
- [ ] Logs accessible and indexed
- [ ] Performance monitoring active (APM)

### 10. Testing

- [ ] Unit tests passing: `npm run test`
- [ ] E2E tests passing: `npm run test:e2e`
- [ ] Load testing performed
- [ ] Security testing (OWASP Top 10)
- [ ] Database migration testing in production-like environment

### 11. Backup & Recovery

- [ ] Database backups automated
- [ ] Backup retention: minimum 30 days
- [ ] Restore procedure documented and tested
- [ ] Point-in-time recovery available
- [ ] Disaster recovery plan documented

### 12. Compliance & Documentation

- [ ] Privacy Policy updated with audit logging practices
- [ ] GDPR compliance (if applicable)
- [ ] Data retention policies documented
- [ ] Security incident response plan documented
- [ ] On-call runbook prepared
- [ ] Architecture documentation updated

## Quick Verification Commands

```bash
# Health check
curl -X GET http://localhost:3004/api/health

# Readiness check
curl -X GET http://localhost:3004/api/ready

# Test login audit
curl -X POST http://localhost:3004/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"wrong"}'

# Check logs for AUDIT_EVENT
docker logs <container-id> | grep AUDIT_EVENT

# Verify rate limiting
for i in {1..25}; do curl http://localhost:3004/api/auth/login; done
# Should see 429 Too Many Requests after 20 requests
```

## Deployment Steps

1. **Pre-deployment**
   ```bash
   npm run build
   npm run test
   npm run test:e2e
   npm run migration:show  # Verify migrations
   ```

2. **Deployment**
   ```bash
   npm run migration:run  # Apply migrations
   npm run start:prod
   ```

3. **Post-deployment**
   - Monitor logs for errors
   - Verify health endpoint responding
   - Test user login flow
   - Verify audit logs being recorded
   - Check Meta sync jobs running

## Rollback Plan

If issues occur:

1. Stop new version: `docker stop <new-container>`
2. Revert migrations (if necessary): `npm run migration:revert`
3. Start previous version: `docker start <old-container>`
4. Review error logs and audit trail
5. Post-mortem analysis

## Notes

- This backend is production-ready once all checkboxes are complete
- Security headers and rate limiting prevent most common attacks
- Audit trail enables compliance and incident investigation
- Health/readiness endpoints critical for orchestrator integration
- Database is the critical resource - monitor closely
