# AetherForge + Prometheus → FORGE (dreaming-doing)
## Documento de Requisitos: Ctrl+C / Ctrl+V + Adaptação

**Versão:** 2026-06-12  
**Auditoria:** 12+ subagentes, 4 passagens read-only  
**Fonte (NÃO MEXER):** `/home/rdarienzo/Projetos/vibrant-visionary-craft1`  
**Destino (ÚNICO ALVO DE ESCRITA):** `/home/rdarienzo/Projetos/dreaming-doing`  
**Supabase fonte:** `mubukeqzqokptgngdscc`  
**Supabase destino:** `dpduljngdurfpmaclffa`

---

## 0. Premissa do produto (leia antes de copiar qualquer arquivo)

### O que é o export

| Item | Definição |
|------|-----------|
| **O quê** | Plataforma **AetherForge** (+ Prometheus como wizard de criação) do vibrant |
| **Para onde** | Aba **AI Agents** na dashboard FORGE existente |
| **Como parece** | Mesma shell (`DashboardShell`), mesma lista de projetos, mesmo `PromptEngine` na criação |
| **Ao abrir projeto agente** | Editor **React Flow** (flow builder), **não** o editor Monaco/site |
| **Motor de execução** | **AetherForge gateway** + tabelas `agent_flows` / `agent_executions` — **NÃO** `agent_runs` |

### O que NÃO é este export

- **NÃO** é extensão do app builder de sites (`agent-run`, Inngest do coding agent, E2B preview)
- **NÃO** inclui LARA, `vps-voice`, consciousness, domínio jurídico (Dr. Prático)
- **NÃO** é merge dos dois Supabase projects
- **NÃO** existe "WaterForge" no disco — nome correto: **AetherForge**

### Equação

```
AetherForge (vibrant) + shell FORGE (dreaming-doing) = aba AI Agents com runtime AetherForge
```

---

## 1. Mapa de arquitetura — fonte (100% AetherForge/Prometheus)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UI — React SPA (vibrant)                                                │
│  AdminAgentBuilderView → FlowBuilderDialog (98 arquivos flow-builder)   │
│  prometheus-studio/ (33 arquivos) — boardroom, streaming, review         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ CRUD agent_flows, invoke edge functions
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SUPABASE EDGE (Deno/TS) — projeto mubukeqzqokptgngdscc                  │
│  aetherforge-gateway (BFS executor, ~522 LOC)                            │
│  + 9 satélites aetherforge-*                                             │
│  prometheus-builder, prometheus-tool-executor, prometheus-healer,          │
│  prometheus-learn-pipeline                                               │
│  _shared/: gateway-*, executor-*, llm-router, tool-executor (~3570 LOC)  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  POSTGRES — 20+ tabelas agent_* + prometheus_* + tool_registry + RAG     │
└─────────────────────────────────────────────────────────────────────────┘

Offloads opcionais (substituir no destino):
  • Celery ollama_inference — só quando model = ollama/* no llm-router
  • Celery prometheus_orchestrate — só quando quality_model = ollama/*
  • KVM8 :8890 — aetherforge-executor-code (NÃO copiar)
  • KVM8 Whisper/Kokoro — gateway-voice (opcional v2)
```

### Motor de execução real do AetherForge

- **Primário:** `aetherforge-gateway` — BFS síncrono no Edge
- **NÃO usa Celery** para executar flows
- Celery aparece apenas como bypass de timeout Ollama (`llm-router.ts` → `VPS_CELERY_URL`)

---

## 2. Mapa de arquitetura — destino (como deve ficar)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FORGE Dashboard (dreaming-doing) — JÁ EXISTE                            │
│  DashboardShell + ProjectsDashboard (sites, kind=app)                    │
│  + NOVA aba "AI Agents" → AgentsDashboard (kind=agent)                   │
│  + PromptEngine (mesmo componente de criação)                            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
          kind=app              │              kind=agent
                ▼               │               ▼
┌───────────────────────┐       │    ┌───────────────────────────────┐
│ /projects/$id         │       │    │ /agents/$id                   │
│ Monaco+Chat+Preview   │       │    │ React Flow builder (AetherForge)│
│ agent-run (INTOCÁVEL) │       │    │ aetherforge-gateway motor       │
└───────────────────────┘       │    └───────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SUPABASE dpduljngdurfpmaclffa — migrations NOVAS (agent_* portadas)     │
│  Edge functions NOVAS — lista em deploy-all.sh                           │
│  Inngest — SOMENTE se substituir Celery Ollama / runs longos (>60s Edge) │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Inventário Ctrl+C — Backend Edge Functions

### 3.1 AetherForge (copiar → renomear opcional `forge-*` ou manter `aetherforge-*`)

| # | Origem | LOC ~ | Copiar? | Adaptação obrigatória |
|---|--------|-------|---------|----------------------|
| 1 | `supabase/functions/aetherforge-gateway/index.ts` | 522 | **SIM** | Remover branch KVM8 `:8890`; Edge 60s → Inngest para flows longos; `verify_jwt = false` |
| 2 | `supabase/functions/aetherforge-rag-embed/index.ts` | 317 | **SIM** | `OLLAMA_EMBED_URL` ou provider cloud; remover header `X-Lara-Origin` |
| 3 | `supabase/functions/aetherforge-api-proxy/index.ts` | 190 | **SIM** | Rate limit Redis ou manter in-memory |
| 4 | `supabase/functions/aetherforge-cron/index.ts` | 362 | **SIM** | Requer `pg_cron` ativo no destino |
| 5 | `supabase/functions/aetherforge-webhook-worker/index.ts` | 207 | **SIM** | URL gateway → projeto destino |
| 6 | `supabase/functions/aetherforge-healthz/index.ts` | 138 | **SIM** | Checks adaptados |
| 7 | `supabase/functions/aetherforge-gdpr/index.ts` | 273 | **SIM** | Retabular `AGENT_TABLES[]` |
| 8 | `supabase/functions/aetherforge-widget/index.ts` | 165 | Fase 2 | Embed JS |
| 9 | `supabase/functions/aetherforge-marketplace-checkout/index.ts` | 132 | Fase 3 | Stripe |
| 10 | `supabase/functions/aetherforge-executor-code/index.ts` | 588 | **NÃO** | Substituir por Inngest step runner |

### 3.2 Prometheus (copiar)

| # | Origem | Copiar? | Adaptação |
|---|--------|---------|-----------|
| 1 | `supabase/functions/prometheus-builder/index.ts` | **SIM** | Remover bifurcação VPS/Celery; dispatch Inngest ou TS waitUntil only |
| 2 | `supabase/functions/prometheus-tool-executor/index.ts` | **SIM** | Tools que dependem de gateway |
| 3 | `supabase/functions/prometheus-healer/index.ts` | Fase 3 | Pós-deploy physician |
| 4 | `supabase/functions/prometheus-learn-pipeline/index.ts` | Fase 3 | Codex semanal |

### 3.3 Edge functions satélite (Prometheus tools dependem)

| Função | Necessária para | Copiar? |
|--------|-----------------|---------|
| `firecrawl-search/index.ts` | `research_web` (prometheus-tools) | **SIM** |
| `web-research-tools` | Referenciado em tool-executor | **NÃO EXISTE no vibrant** — criar ou remover tool |
| `aetherforge-gateway` | `execute_flow` sentinel | **SIM** (item 3.1.1) |

### 3.4 `_shared/` — módulos gateway (copiar todos)

```
supabase/functions/_shared/
├── gateway-core.ts
├── gateway-saga.ts
├── gateway-whatsapp.ts      # Fase 2 — remover default "direito-pratico"
├── gateway-voice.ts         # Fase 2 — ou desabilitar v1
├── executor-llm.ts
├── executor-tool.ts
├── executor-memory.ts
├── executor-subflow.ts
├── executor-vision.ts
├── llm-router.ts            # Remover callOllamaViaCelery ou → Inngest
├── model-catalog.ts
├── tool-executor.ts         # ~3570 LOC — CRÍTICO
├── memory-manager.ts
├── multi-agent-bus.ts
├── condition-evaluator.ts
├── semantic-cache.ts
├── output-guards.ts         # Remover import dr-pratico pii-mask
├── eval-layer.ts            # FIX: passar modelId (bug atual)
├── canary-router.ts
├── context-window-manager.ts
├── provider-health.ts
├── egress-meter.ts
└── marketplace-billing.ts   # Fase 3
```

### 3.5 `_shared/` — módulos Prometheus (copiar todos 16)

```
prometheus-types.ts
prometheus-db.ts
prometheus-cortex.ts       # FSM canônico — usar este, NÃO Python
prometheus-pipeline.ts
prometheus-react-loop.ts
prometheus-analyst.ts
prometheus-architect.ts
prometheus-scribe.ts
prometheus-sentinel.ts
prometheus-tools.ts
prometheus-prompts.ts        # Remover blocos OAB/CFM/legal
prometheus-deliberation.ts
prometheus-enrichment.ts
prometheus-report.ts
prometheus-physician.ts      # Fase 3
prometheus-codex.ts          # Fase 3
```

### 3.6 Python Celery — NÃO copiar

```
vps-celery/app/tasks/prometheus_orchestrator.py  → descartar
vps-celery/app/services/prometheus_react.py      → descartar
```

Substituir por: Inngest multi-fase **ou** `prometheus-cortex.ts` inline com resume.

---

## 4. Inventário Ctrl+C — Database (migrations)

### 4.1 Tabelas core AetherForge (OBRIGATÓRIAS)

| Tabela | Migration origem | FK principal |
|--------|------------------|--------------|
| `agent_flows` | `20260314111543_*.sql` | `user_id` → auth.users |
| `agent_flow_nodes` | mesmo | `flow_id` |
| `agent_deployments` | mesmo | `flow_id` |
| `agent_executions` | `20260314111622_*.sql` | `flow_id`, `deployment_id` |
| `agent_execution_steps` | mesmo | `execution_id` |
| `execution_dead_letter_queue` | mesmo | `execution_id` |
| `agent_memory` | `20260314183627_*.sql` | `flow_id` |
| `tool_registry` | `20260314111903_*.sql` | — |
| `tenant_secrets` | mesmo | `tenant_id` (= user_id) |
| `prompt_store` | mesmo | — |
| `rag_documents` | mesmo | — |
| `rag_chunks` | mesmo | vector 768 |
| `semantic_cache` | mesmo | — |
| `webhook_inbox` | mesmo | — |
| `agent_test_suites` | mesmo | `flow_id` |

### 4.2 Tabelas colaboração / versioning (RECOMENDADAS)

| Tabela | Migration |
|--------|-----------|
| `agent_flow_versions` | `20260314130132_*.sql` |
| `agent_flow_members` | `20260314130653_*.sql` |
| `agent_flow_comments` | `20260314135817_*.sql` |
| `agent_versions` | `20260314141246_*.sql` |
| `agent_schedules` | `20260314131742_*.sql` |
| `agent_notifications` | `20260314132842_*.sql` |
| `agent_alert_rules` | mesmo |
| `agent_tools` | `20260405184033_*.sql` |

### 4.3 Marketplace (OPCIONAL fase 3)

| Tabela | Migration |
|--------|-----------|
| `agent_marketplace_listings` | `20260314132033_*.sql` |
| `agent_marketplace_ratings` | mesmo |
| `agent_marketplace_purchases` | `20260314201117_*.sql` |

### 4.4 Prometheus (OBRIGATÓRIAS se wizard de criação)

| Tabela | Migration | Realtime? |
|--------|-----------|-----------|
| `prometheus_build_sessions` | `20260314222931_*.sql` | — |
| `prometheus_build_turns` | `20260315020356_*.sql` | **SIM** — UI depende |
| `prometheus_auto_heal_config` | `20260315040352_*.sql` | Fase 3 |
| `prometheus_healing_log` | mesmo | Fase 3 |
| `prometheus_job_queue` | `20260318193317_*.sql` | **NÃO copiar** — schema morto |

### 4.5 RPCs / extensions (OBRIGATÓRIOS)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Buscar em migrations vibrant:
-- match_rag_chunks
-- search_rag_chunks
-- increment_cache_hit
-- prometheus_increment_iteration
```

### 4.6 Tabelas vibrant — NÃO copiar

| Tabela | Motivo |
|--------|--------|
| `agent_actions` | Domínio Dr. Prático |
| `video_agent_prompts` | Pipeline vídeo |
| `legal_draft_rag_library` | Jurídico |
| Todas `lara_*` | Fora de escopo |
| Todas `dr_pratico_*`, `acordo_*` | Jurídico |

### 4.7 Adaptação schema no destino

```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'app'
  CHECK (kind IN ('app', 'agent'));

ALTER TABLE public.agent_flows
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
```

**Nota:** `agent_runs` no destino é do app builder — **semântica diferente** de `agent_executions`. Coexistem sem conflito de nome se documentado.

### 4.8 RLS

Copiar policies do vibrant. Replicar `20260315120001_fix_rls_execution_insert.sql`.

---

## 5. Inventário Ctrl+C — Frontend

### 5.1 Flow builder (98 arquivos)

```
ORIGEM: vibrant-visionary-craft1/src/components/admin/agent-builder/
DESTINO: dreaming-doing/src/components/forge-agents/
```

17 nós: Trigger, LLM, Tool, Condition, OutputGuard, RAGSearch, Memory, HITL, Loop, SubFlow, STT, TTS, Vision, Switch, Delay, Transformer, ErrorHandler.

27 painéis laterais (Test, Deploy, RAG, Secrets, HITL, DLQ, etc.).

### 5.2 Prometheus studio (33 arquivos)

```
ORIGEM: vibrant-visionary-craft1/src/components/prometheus-studio/
DESTINO: dreaming-doing/src/components/forge-prometheus/
```

**NÃO copiar** `prometheus-studio.css` — reescrever com `@forge/ui`.

### 5.3 Dashboard FORGE — criar/modificar

| Arquivo | Ação |
|---------|------|
| `DashboardShell.tsx` | Nav **AI Agents** |
| `AgentsDashboard.tsx` | **CRIAR** — clone ProjectsDashboard, `kind=agent` |
| `PromptEngine.tsx` | Criar projeto `kind=agent` |
| `src/routes/agents/index.tsx` | **CRIAR** |
| `src/routes/agents/$agentId/index.tsx` | **CRIAR** — FlowBuilder |

### 5.4 Dependências npm

```json
"@xyflow/react": "^12.10.1",
"zustand": "^4.5.0",
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

Install: `npm install` (Vercel usa npm).

### 5.5 Imports que quebram ao copiar

| Import vibrant | Destino |
|----------------|---------|
| `@/hooks/use-toast` | → `@/lib/toast` (sonner) |
| `@/hooks/useAdmin` | Criar gate admin FORGE |
| `@/integrations/supabase/types` | Regenerar pós-migration |
| `admin-secrets-map` | → `connectors` / `platform_secrets` |

### 5.6 NÃO copiar

- Tema cream/blue/Ubuntu
- Default `"direito-pratico"` WhatsApp
- Templates jurídicos
- `LawyerDashboard.tsx`

---

## 6. Variáveis de ambiente

### Edge secrets AetherForge (Supabase destino)

| Variável | Obrigatória v1? |
|----------|-----------------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | SIM |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | SIM (ou BYOK) |
| `GROQ_API_KEY`, `XAI_API_KEY` | Recomendado |
| `FIRECRAWL_API_KEY` | Se Prometheus wizard |
| `VPS_CELERY_URL`, `KVM8_IP` | **REMOVER v1** |

### Mapeamento secrets

`tenant_secrets` → `connectors` + `platform_secrets` (já existem no FORGE).

---

## 7. Deploy e CI/CD

### Atualizar `scripts/sync/deploy-all.sh`

Adicionar após port:

```
aetherforge-gateway, aetherforge-rag-embed, aetherforge-api-proxy,
aetherforge-cron, aetherforge-webhook-worker, aetherforge-healthz,
aetherforge-gdpr, prometheus-builder, prometheus-tool-executor,
firecrawl-search
```

### `supabase/config.toml`

Adicionar `[functions.*] verify_jwt = false` para gateway, cron, webhook-worker, widget.

### Limites runtime

| Limite | Valor | Ação |
|--------|-------|------|
| Edge | ~60s | Inngest para flows longos |
| Vercel Inngest | 300s | Prometheus multi-fase Inngest |

---

## 8. Bugs vibrant — corrigir no destino (não replicar)

| Bug | Fix |
|-----|-----|
| Eval layer skip | Passar `modelId` em `eval-layer.ts` |
| Idempotency coluna | `tool_idempotency_key` em tool-executor |
| `rag_search` mock | Wire `search_rag_chunks` RPC |
| `web-research-tools` missing | Criar fn ou remover tool |
| KVM8 skip guards | Remover branch KVM8 |
| loop/delay stubs | Implementar ou Inngest `step.sleep` |

---

## 9. Nós flow builder — status backend

| Prontos | Parcial | Stub / v1 off |
|---------|---------|---------------|
| trigger, llm, tool, condition, memory, vision, hitl, sub_flow, output_guard | rag_search, switch | loop, delay, transformer, error_handler, stt, tts |

---

## 10. Prometheus FSM

```
discovery → clarification → planning → approval → building → testing → review → deploying → complete
```

**Canônico:** `prometheus-cortex.ts` (TS). **Descartar:** `prometheus_orchestrator.py`.

Realtime obrigatório: `prometheus_build_turns` INSERT.

---

## 11. Ordem de execução

```
FASE A — Migrations + projects.kind + deploy-all + config.toml JWT
FASE B — _shared/ + edge functions + fixes §8
FASE C — Dashboard aba AI Agents + rotas /agents
FASE D — Port flow-builder (98 arquivos) + @xyflow + @forge/ui
FASE E — Prometheus wizard (33 arquivos) + Inngest se necessário
FASE F — Hardening + smoke tests
```

---

## 12. Checklist validação

- [ ] vibrant intocado
- [ ] Aba AI Agents lista `kind=agent`
- [ ] Abrir agente → React Flow
- [ ] TestPanel → gateway executa
- [ ] `agent_runs` app builder inalterado
- [ ] deploy-all.sh atualizado
- [ ] Zero imports legal/lara no código portado

---

## 13. Referências vibrant (read-only)

```
docs/AetherForge — Master Blueprint v2.0
.lovable/aetherforge/00-ROADMAP-V2.md
.lovable/prometheus/00-ROADMAP.md
```

---

## 14. Resumo implementador

1. Copiar AetherForge + Prometheus vibrant → dreaming-doing  
2. Não tocar vibrant nem `agent_runs`  
3. Integrar como aba **AI Agents** na dashboard FORGE  
4. Adaptar imports, tema `@forge/ui`, secrets, JWT, deploy, bugs  
5. Substituir Celery/KVM8 por Inngest/cloud no destino  
6. Validar checklist §12  

---

*Documento de auditoria read-only. Validar arquivos fonte antes de cada cópia.*