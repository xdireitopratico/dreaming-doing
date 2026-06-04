# Secrets globais do FORGE

Chaves **globais do projeto** (E2B, fallback Groq/xAI, etc.) **não** ficam em `/api-keys`.

## Painel no app (recomendado)

1. Login como **xdireitopratico@gmail.com**
2. **Ajustes** → `/settings`
3. Seção **Secrets globais do projeto**

Valores ficam em `platform_secrets`. RLS bloqueia acesso direto; só Edge Functions com service role leem. O browser nunca recebe o valor após salvar.

## Supabase Dashboard (backup)

1. [Supabase Dashboard](https://supabase.com/dashboard/project/dpduljngdurfpmaclffa)
2. **Project Settings** → **Edge Functions** → **Secrets**

## Secrets usuais

| Nome | Uso |
|------|-----|
| `E2B_API_KEY` | Preview ao vivo (sandbox) |
| `E2B_TEMPLATE` | Template E2B (ex. `nodejs`) |
| `XAI_API_KEY` | Fallback STT Grok e agente |
| `GROQ_API_KEY` | Fallback Whisper e agente |
| `ANTHROPIC_API_KEY` | Fallback Claude |
| `OPENAI_API_KEY` | Fallback GPT |
| `NVIDIA_API_KEY` | Fallback NIM |

## CLI

```bash
supabase secrets set --project-ref dpduljngdurfpmaclffa \
  XAI_API_KEY="sua-chave" \
  GROQ_API_KEY="sua-chave" \
  E2B_API_KEY="sua-chave"
```

Prioridade nas Edge Functions: **vault FORGE (Ajustes)** → **Supabase Edge env** → chaves do usuário em `/api-keys`.