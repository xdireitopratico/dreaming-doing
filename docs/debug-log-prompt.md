# Prompt LLM para Diagnóstico com debug-log.sh

Cole este prompt no início de qualquer conversa com LLM para diagnóstico de erro:

---

```
## Contexto
Estamos debugando um erro em produção no projeto dreaming-doing.
Stack: Next.js (App Router) + Supabase + Vercel + Inngest.

## Logs de debug
Por favor, execute imediatamente:

```bash
./scripts/debug-log.sh --hours 6 --errors-only
```

Se o bug for de chat/stream/plano e você tiver o `run_id`:

```bash
./scripts/debug-log.sh --run-id RUN_ID_AQUI --telemetry-only --hours 12
```

Analise a saída e identifique a causa raiz antes de sugerir qualquer alteração de código.

Seções: SUPABASE (functions/edge/postgres), VERCEL, INNGEST, **TELEMETRY** (eventos estruturados do cliente/servidor).

Se alguma fonte retornou erro, comece por ela. Para bugs de UX no chat, priorize **TELEMETRY** + `docs/debug-runs.sql` Q6.

## Regras
1. NUNCA sugira código antes de ver os logs
2. Se os logs estiverem limpos, investigue outras causas (cache, DNS, 
   configuração)
3. Prefira logs estruturados (JSON) para análise programática
```
