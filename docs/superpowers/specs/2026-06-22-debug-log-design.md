# debug-log.sh — Observability Infrastructure

**Date**: 2026-06-22
**Status**: Implemented

## Problem

Debugging production issues required manually checking 3 separate dashboards:
- Supabase Dashboard (function logs, edge logs, postgres errors)
- Vercel Dashboard (deploy events, build logs)
- Inngest Cloud (runs, failures)

No unified view meant LLMs had no way to read logs before diagnosing.

## Solution

A single bash script (`scripts/debug-log.sh`) that collects from all 3 sources
and outputs formatted logs, designed to be piped directly to an LLM:

```bash
./scripts/debug-log.sh --hours 6 --errors-only | llm "diagnostica"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   debug-log.sh (bash)                        │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Supabase     │  │ Vercel       │  │ Inngest           │    │
│  │ Management   │  │ REST API     │  │ REST API / CLI    │    │
│  │ API          │  │              │  │                   │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘    │
│         │                 │                    │               │
│         └─────────────────┴────────────────────┘               │
│                            │                                   │
│                     ┌──────▼──────┐                            │
│                     │  Formatter   │                            │
│                     │  (seções,    │                            │
│                     │   timestamps, │                            │
│                     │   cores)     │                            │
│                     └──────┬──────┘                            │
│                            │                                   │
│                     ┌──────▼──────┐                            │
│                     │  stdout      │                            │
│                     │  ou JSON     │                            │
│                     └─────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## API Coverage

| Source | Endpoint | Auth | Plan |
|--------|----------|------|------|
| Supabase function_logs | `POST /v1/projects/{ref}/analytics/endpoints/logs.all` | PAT (Personal Access Token) | Free+ |
| Supabase edge_logs | `POST /v1/projects/{ref}/analytics/endpoints/logs.all` | PAT | Free+ |
| Supabase postgres_logs | `POST /v1/projects/{ref}/analytics/endpoints/logs.all` | PAT | Free+ |
| Vercel deployments | `GET /v6/deployments` | Access Token | Free+ |
| Vercel deploy events | `GET /v2/deployments/{id}/events` | Access Token | Free+ |
| Inngest runs | `GET /v1/runs` | Signing Key | Free+ |

## Output Format

### Text mode (default)
```
  ════════════════════════════════════════════════════════════
    DEBUG LOGS · 2026-06-22T10:30:00.000Z · 6h window
  ════════════════════════════════════════════════════════════

## SUPABASE (3)
2026-06-22T09:15:00.123Z ERROR  supabase/fn:process-order Payment failed: timeout
2026-06-22T09:10:00.456Z INFO   supabase/edge:1c2a3b Route matched

## VERCEL (2)
2026-06-22T09:00:00.789Z INFO   vercel/deploy:dpl123 State: READY
2026-06-22T08:55:00.012Z ERROR  vercel/build:dpl123 Build failed: module not found

## INNGEST (1)
2026-06-22T08:50:00.345Z ERROR  inngest/run:run456 ChargeAgent: FAILED

  ─── FIM ───
```

### JSON mode
```json
{"timestamp":"2026-06-22T10:30:00.000Z","window_hours":6,"entries":[
{"timestamp":"2026-06-22T09:15:00.123Z","level":"ERROR","source":"supabase/fn:process-order","message":"Payment failed: timeout"},
...
]}
```

## LLM Integration

See `docs/debug-log-prompt.md` for the standard prompt template.

## Setup

```bash
cp .env.debug.example .env.debug
# Preencha os tokens
source scripts/setup-debug.sh
```

## CLI Reference

```
-s, --supabase      Apenas logs do Supabase
-v, --vercel        Apenas logs da Vercel  
-i, --inngest       Apenas logs do Inngest
-j, --json          Saída em JSON (pipe-friendly)
-h, --hours N       Janela de horas (default: 6)
-e, --errors-only   Apenas entradas com ERROR/FAILED
-f, --follow        Modo tail (atualiza a cada 30s)
-c, --config FILE   Caminho do arquivo .env.debug
```

## Known Limitations

1. **Vercel function logs** (runtime invocations) — não disponíveis via REST no
   free tier. Requer Log Drains (Pro+). O script captura deploy events e build
   logs.
2. **Supabase log retention** — ~1-3 dias no free tier.
3. **jq dependency** — necessário para parsing JSON. Instalado automaticamente
   pelo setup.

## Telemetry (Fase 1 — 2026-06-23)

`debug-log.sh` consulta `agent_streaming_telemetry` via PostgREST (service role).

- Seção **TELEMETRY** na saída padrão
- `--telemetry-only` — só telemetria
- `--run-id UUID` — filtra por run
- `--errors-only` — só eventos de degradação (seq_gap, realtime_error, etc.)
- Credenciais: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` em `.env.debug` ou fallback `.env.local`

SQL correlato: `docs/debug-runs.sql` Q6 (timeline por run), Q7 (frequência 24h).

## Future

- [x] Streaming telemetry integration (agent_streaming_telemetry)
- [ ] Vercel Log Drains integration (Pro+)
- [ ] Sentry/DataDog integration
- [ ] Rate limiting / backoff
- [ ] Pagination (mais que 50 linhas por query)
- [ ] Configurable output templates
