## Pilot Release Checklist

Checklist mínima para liberar a Nexora em ambiente piloto real sem deploy artesanal.

### Gate técnico

- Backend `npm run build`
- Backend `npm test -- --runInBand`
- Frontend `npm run build`
- Workflow `Release Gate` aprovado no repositório

### Gate operacional

- `SENTRY_DSN` configurado no frontend de produção
- `ALERTS_WEBHOOK_URL` ou `SLACK_WEBHOOK_URL` configurado no backend
- `FRONTEND_URL` e `BACKEND_URL` apontando para domínios reais
- `JWT_SECRET`, `JWT_REFRESH_SECRET` e `CRYPTO_SECRET` trocados
- `ALLOW_DEMO_SEED` ausente no ambiente piloto

### Gate comercial

- Conta demo com stores e campanhas coerentes
- Landing revisada para narrativa comercial
- Login revisado para narrativa de plataforma
- Time de suporte com URL de contato válida

### Rollback simples

1. Publicar somente após build e testes verdes.
2. Manter a imagem/container anterior disponível.
3. Se houver erro crítico de auth, publicação ou sync Meta:
   - reverter para a imagem anterior
   - validar `/api/health` e `/api/ready`
   - revisar alertas antes de retomar o rollout
