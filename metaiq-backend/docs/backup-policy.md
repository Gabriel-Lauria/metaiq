## Política de Backup Operacional

Backups do MetaIQ não devem ser versionados no repositório em nenhuma circunstância.

Regras mínimas:

- Gere dumps apenas em ambiente operacional controlado.
- Armazene backups em storage privado com criptografia e controle de acesso.
- Nunca inclua usuários, hashes, tokens ou dados exportados manualmente em commits.
- Use nomes de arquivo datados fora do workspace versionado, por exemplo `C:\secure-backups\metaiq\2026-04-29.dump`.
- Faça restore somente em ambientes isolados e com credenciais injetadas por variáveis de ambiente.

Fluxo recomendado:

```powershell
pg_dump --format=custom --file C:\secure-backups\metaiq\metaiq-2026-04-29.dump $env:DATABASE_URL
```

```powershell
pg_restore --clean --if-exists --dbname $env:DATABASE_URL C:\secure-backups\metaiq\metaiq-2026-04-29.dump
```
