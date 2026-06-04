# Secrets das Edge Functions (Supabase)

Chaves **globais do projeto** (E2B, fallback Grok/Groq) **não** ficam em `/api-keys` — são secrets do Supabase.

## Onde configurar no painel

1. Abra [Supabase Dashboard](https://supabase.com/dashboard/project/dpduljngdurfpmaclffa)
2. **Project Settings** (engrenagem do projeto)
3. **Edge Functions**
4. Aba **Secrets**

Não use: Database → API keys, nem variáveis `VITE_*` no Vercel para essas chaves de backend.

## Secrets usuais

| Nome | Uso |
|------|-----|
| `E2B_API_KEY` | Preview ao vivo (sandbox) |
| `XAI_API_KEY` | Fallback STT Grok e agente se o usuário não cadastrou xAI em API Keys |
| `GROQ_API_KEY` | Fallback Whisper e agente |

## CLI

```bash
supabase secrets set --project-ref dpduljngdurfpmaclffa \
  XAI_API_KEY="sua-chave" \
  GROQ_API_KEY="sua-chave" \
  E2B_API_KEY="sua-chave"
```

Depois de alterar secrets, redeploy das funções afetadas:

```bash
supabase functions deploy voice-transcribe connector-upsert agent-run --project-ref dpduljngdurfpmaclffa
```

## Voz (STT)

- Preferência do usuário: **API Keys** → xAI (Grok) ou Groq, e **Modelo e voz** → Grok STT.
- A função `voice-transcribe` usa a chave do usuário primeiro; secrets são fallback.