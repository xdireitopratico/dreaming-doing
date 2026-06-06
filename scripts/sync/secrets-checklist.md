# Secrets que precisam existir no seu projeto (dpduljngdurfpmaclffa)

Configure via:

```bash
supabase secrets set --project-ref dpduljngdurfpmaclffa \
  ANTHROPIC_API_KEY=... \
  GROQ_API_KEY=... \
  ...
```

Ou no dashboard: **Edge Functions → Settings → Secrets**.

## Obrigatórias (núcleo do agente)

- [ ] `ANTHROPIC_API_KEY` — Claude (provider principal)
- [ ] `XAI_API_KEY` — Grok (fallback main)
- [ ] `GROQ_API_KEY` — Llama via Groq (provider cheap)
- [ ] `LOVABLE_API_KEY` — Lovable AI Gateway (último fallback)

## E2B (usuário — não é Edge secret)

- [ ] Chave `e2b_...` em **API Keys** (`/api`) — obrigatória para sandbox/preview
- [ ] Opcional: `E2B_TEMPLATE` — override (padrão `code-interpreter-v1`)
- [ ] `SUPABASE_URL` — Auto-injetado pela CLI; só confirme
- [ ] `SUPABASE_ANON_KEY` — Auto-injetado
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Auto-injetado
- [ ] `SUPABASE_PUBLISHABLE_KEY` — Mesmo valor da anon (ou nova chave format)

## Opcionais (features bloqueadas se faltar)

- [ ] `OPENAI_API_KEY` — Fallback main extra
- [ ] `NVIDIA_API_KEY` — Provedor cheap alternativo
- [ ] `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET` — fase E33
- [ ] `GITHUB_WEBHOOK_SECRET` — fase E35
- [ ] `ENCRYPTION_KEY` — AES-256 (base64, 32 bytes) para `connectors.token_encrypted`
- [ ] `CLOUDFLARE_API_TOKEN` — fase E37
- [ ] `VERCEL_TOKEN` — fase E36

## B13 — Rotação da service role (após migrations B8–B11)

Faça **depois** de `./scripts/sync/migrate.sh` na conta canônica (`dpduljngdurfpmaclffa`).

1. Dashboard Supabase → **Settings → API** → **Reset service role key** (canônica).
2. Se ainda usar Lovable Cloud (`mtcnwvzjfbvyiuhrqrlo`): avalie rotação separada ou descontinue uso da key antiga.
3. Atualizar secret das Edge Functions:
   ```bash
   supabase secrets set --project-ref dpduljngdurfpmaclffa \
     SUPABASE_SERVICE_ROLE_KEY="<nova-key>"
   ```
4. Republicar functions: `./scripts/sync/deploy-all.sh`
5. Smoke: login → abrir projeto → enviar mensagem (`agent-run` SSE) → `connector-upsert` → admin `action: status`.

**Nunca** commitar a nova key no repositório.

## Verificação

```bash
supabase secrets list --project-ref dpduljngdurfpmaclffa
```
