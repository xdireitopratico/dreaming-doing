# FORGE — Estado pós sessão (atualizado)

## Concluído nesta sessão (segurança + sincronização)

### Segurança crítica (B7–B12) — 6 findings fechadas
- **B7** `mcp-server`: agora exige `Authorization`. `authenticate()` valida sessão e checa `user_roles`. Tools sensíveis (`query`, `migrate`, `auth_users`) bloqueadas para não-admin (403).
- **B8** `realtime.messages`: nova policy `project_files-<id>` espelhando a do canal `editor-%`. Bloqueia leak de código entre contas.
- **B9** `deployments`: adicionados `deploy_update_own` e `deploy_delete_own` (só o dono do projeto).
- **B10** `user_roles`: `roles_no_insert/update/delete` — qualquer mutação direta por `authenticated` retorna RLS deny. Só `service_role` muda.
- **B11** `has_role()`: `REVOKE EXECUTE ... FROM authenticated, anon`. Função continua usável dentro de policies.
- **B12** `AdminPlatformSecretsPanel`: gated por query server-side `admin-platform-secrets action:'status'`. `isForgeAdminEmail` virou só dica UX.

### Sincronização Supabase (A1, A3, A5)
- `scripts/sync/README.md` — fluxo de duas contas documentado.
- `scripts/sync/migrate.sh` — `supabase db push` na sua conta.
- `scripts/sync/deploy-all.sh` — deploy de todas as 9 edge functions.
- `scripts/sync/secrets-checklist.md` — 14 secrets que precisam existir.
- `SupabaseConfigBanner` agora alerta visualmente quando `VITE_SUPABASE_URL` ≠ `dpduljngdurfpmaclffa`.

### Schema (paridade entre os dois projetos)
- Migration: adiciona `netlify` ao enum `connector_kind`.
- Migration: adiciona `profiles.integration_prefs jsonb` e `profiles.trial_messages_remaining int` que o app já consumia.

### Hot-fixes de build
- `useConnectors.ts` / `ConnectorGuideModal.tsx` agora compilam com o novo schema.
- `api-keys.tsx`: removida ref a `connectors_public.provider` (usa só `meta.provider`).
- `agent-preferences.ts`: tipo do parsed legacy "rob" → "robin" sem TS narrowing error.

## Para fazer na próxima sessão (continuando o plano de 50)

### Sincronização (resto de A)
- **A2** Rodar `deploy-all.sh` localmente — eu **não posso** fazer isso daqui (não tenho seu token Supabase). É você executando o script.
- **A4** Revisar `supabase/config.toml` por função (CORS, timeouts, verify_jwt).
- **A6** Rodar `migrate.sh` agora para colocar a sua conta no mesmo schema.

### Segurança restante (B13)
- Rotacionar `SUPABASE_SERVICE_ROLE_KEY` depois que a CLI tiver aplicado as policies novas.

### Agente (C14–C23) — refatoração não-trivial
14. UI "Continuar" quando `resumable: true`. 15. Persistir `executionLog`. 16. Backoff por provider. 17. Token usage tracking. 18. Allowlist de `shell_exec`. 19. Hash dos últimos calls em `isStuck`. 20. `RuntimeObserver` rodando `tsc` no E2B. 21. 3 skills concretas. 22. Cancelamento server-side via `runs.canceled_at`. 23. Tabela `agent_runs` + dashboard.

### Editor (D24–D32)
24. Monaco. 25. File tree CRUD. 26. kbar. 27. Diff viewer. 28. HMR via Realtime. 29. Voice global. 30. Visual edits. 31. Trace expansível. 32. Tema persistente.

### Integrações (E33–E40) — **bloqueadas por secrets seus**
- E33–E35 GitHub OAuth + push + webhook: precisa `GITHUB_OAUTH_CLIENT_ID/SECRET`, `ENCRYPTION_KEY`.
- E36 Vercel deploy: precisa `VERCEL_TOKEN`.
- E37 Cloudflare: `CLOUDFLARE_API_TOKEN`.
- E38 Stripe billing: chave + plano. E39 MCP UI. E40 multi-provider UI.

### Performance & launch (F41–F50)
41. Bundle audit. 42. Code-split (Monaco, CodeEditor). 43. Imagens. 44. SEO `head()` por rota. 45. robots/sitemap. 46. Lighthouse. 47. Rate limit em `agent-run`. 48. `audit_events`. 49. Backup. 50. E2E playwright.

## Secrets atuais (Lovable Cloud)
`ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `E2B_API_KEY`, `LOVABLE_API_KEY`, `SUPABASE_*`.

Faltando para fases futuras: `GITHUB_OAUTH_CLIENT_ID/SECRET`, `GITHUB_WEBHOOK_SECRET`, `ENCRYPTION_KEY`, `VERCEL_TOKEN`, `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`.

## Importante — paridade entre os dois Supabase

Toda migration nova que eu criar daqui para frente **só vai para `mtcnwvzjfbvyiuhrqrlo` (Lovable Cloud)** via tool. Para sua conta `dpduljngdurfpmaclffa` ficar igual:

```bash
cd <projeto>
./scripts/sync/migrate.sh   # aplica migrations novas
./scripts/sync/deploy-all.sh   # republica edge functions
```

Rode após cada sessão minha que mexer em backend.
