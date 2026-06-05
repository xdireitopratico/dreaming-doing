# Secrets que precisam existir no seu projeto (dpduljngdurfpmaclffa)

Configure via:

```bash
supabase secrets set --project-ref dpduljngdurfpmaclffa \
  ANTHROPIC_API_KEY=... \
  GROQ_API_KEY=... \
  ...
```

Ou no dashboard: **Edge Functions → Settings → Secrets**.

## Obrigatórias (núcleo do agente + sandbox)

- [ ] `ANTHROPIC_API_KEY` — Claude (provider principal)
- [ ] `XAI_API_KEY` — Grok (fallback main)
- [ ] `GROQ_API_KEY` — Llama via Groq (provider cheap)
- [ ] `LOVABLE_API_KEY` — Lovable AI Gateway (último fallback)
- [ ] `E2B_API_KEY` — Sandbox de preview ao vivo
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

## Verificação

```bash
supabase secrets list --project-ref dpduljngdurfpmaclffa
```
