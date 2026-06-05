# FORGE — Sincronização entre os dois Supabase

Hoje o projeto roda em **dois** Supabase:

| Ref                    | Quem usa                                | Modificável daqui  |
| ---------------------- | --------------------------------------- | ------------------ |
| `mtcnwvzjfbvyiuhrqrlo` | Lovable Cloud (preview Lovable)         | ✅ via tools        |
| `dpduljngdurfpmaclffa` | Sua conta (Vercel, CLI local, canônico) | ❌ via CLI seu      |

Fluxo recomendado a cada mudança no Lovable:

1. Eu aplico a migration via tool no Lovable Cloud.
2. O arquivo `supabase/migrations/<timestamp>_*.sql` resultante entra no repo.
3. Você roda `scripts/sync/migrate.sh` para aplicar a mesma migration na sua conta via CLI.

## Pré-requisitos

```bash
brew install supabase/tap/supabase   # ou npm i -g supabase
supabase login                       # token pessoal seu
supabase link --project-ref dpduljngdurfpmaclffa
```

## Scripts

- `migrate.sh` — `supabase db push` na sua conta (aplica todas as migrations novas).
- `deploy-all.sh` — `supabase functions deploy <name>` para todas as edge functions atuais.
- `secrets-checklist.md` — lista de secrets que precisam existir no seu projeto.
- `schema-diff.sql` — diff manual de schema (rodar ad-hoc; documentação abaixo).

## Diff de schema (A1)

```bash
supabase db diff --linked --schema public > scripts/sync/schema-diff.sql
```

Se sair vazio, os dois projetos estão alinhados. Se sair com SQL, revise e aplique manualmente.
