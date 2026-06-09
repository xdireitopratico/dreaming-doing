# Secrets globais do FORGE

Chaves **globais do projeto** (fallback Groq/xAI, etc.) ficam em **Ajustes → Secrets globais**.

**E2B (sandbox)** não usa secret global — somente chave do usuário em **API Keys** (`/api`).

## Painel no app (recomendado)

1. Login como administrador FORGE
2. **Ajustes** → `/settings`
3. Seção **Secrets globais do projeto**

Valores ficam em `platform_secrets`. RLS bloqueia acesso direto; só Edge Functions com service role leem. O browser nunca recebe o valor após salvar.

## Supabase Dashboard (backup)

1. [Supabase Dashboard](https://supabase.com/dashboard/project/dpduljngdurfpmaclffa)
2. **Project Settings** → **Edge Functions** → **Secrets**

## Secrets usuais (plataforma)

| Nome                | Uso                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INNGEST_EVENT_KEY` | **Obrigatório** — dispara jobs do agente e `continue_queue` (fila). All dispatches (first msg, plan-approve `dispatch_build`, queue drain) centralized in Edge `agent-run` action which owns the key check+send+loud failure+append finish. Never leaves `pending` run. Sem ela: early loud error (no orphan pending-without-events / inngest_failed state). |
| `E2B_TEMPLATE`      | Opcional — override do template padrão (`code-interpreter-v1`)                                                                                                                                                                                                                                                                                               |
| `XAI_API_KEY`       | Fallback STT Grok e agente                                                                                                                                                                                                                                                                                                                                   |
| `GROQ_API_KEY`      | Fallback Whisper e agente                                                                                                                                                                                                                                                                                                                                    |
| `ANTHROPIC_API_KEY` | Fallback Claude                                                                                                                                                                                                                                                                                                                                              |
| `OPENAI_API_KEY`    | Fallback GPT                                                                                                                                                                                                                                                                                                                                                 |
| `NVIDIA_API_KEY`    | Fallback NIM                                                                                                                                                                                                                                                                                                                                                 |

## E2B (usuário — obrigatório)

| Onde                 | O quê                                          |
| -------------------- | ---------------------------------------------- |
| `/api` → Sandbox E2B | Chave `e2b_...` do usuário                     |
| `e2b-health`         | Teste create + node/npm smoke ao salvar        |
| Template padrão      | `code-interpreter-v1` (com Node/npm para Vite) |

## CLI

```bash
supabase secrets set --project-ref dpduljngdurfpmaclffa \
  XAI_API_KEY="sua-chave" \
  GROQ_API_KEY="sua-chave"
```

Prioridade nas Edge Functions: **vault FORGE (Ajustes)** → **Supabase Edge env** → chaves do usuário em `/api`.

## Modo FORGE vs conta própria (`profiles.integration_prefs`)

| Conector                     | `forge`                                       | `own`                                             |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------- |
| GitHub / Vercel / Cloudflare | Infra e tokens globais FORGE quando aplicável | Token em `connectors` via `/connectors` ou editor |
| Supabase                     | Projeto FORGE do deploy                       | `VITE_SUPABASE_*` no deploy do usuário            |
| E2B (sandbox)                | —                                             | **Sempre** chave em `/api` (BYOK)                 |
| LLM / STT                    | Fallback global + **tira-gosto**              | Sempre `/api` (BYOK)                              |
