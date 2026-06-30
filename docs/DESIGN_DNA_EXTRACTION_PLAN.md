# Plano Arquitetural v2 — Design DNA Extraction

**Versão:** 2.1  
**Data:** 2026-06-28  
**Status:** Rascunho — aguarda autorização  

---

## 0. Contexto crítico (aprendido na conversa)

### 0.1 Duas coisas SEPARADAS que eu estava misturando

```
vibecoding agent LLM (agent-run)          design DNA extraction (library)
        │                                          │
        │  usa web-research-providers.ts            │  TEM shallow + deep
        │  para pesquisar/scrape                    │
        │  durante a geração de código              │
        │                                          │
        └─── web-research-providers.ts ─────────────┘
                        │
                  NÃO MEXER AQUI
            É ferramenta do LLM de vibecoding
```

`web-research-providers.ts` **não tem nada a ver com design DNA extraction.** É tool do agente Vibe Code para pesquisar/scrape durante geração de código. Fica intacto.

### 0.2 Design DNA extraction = dois modos distintos

| Modo | O que faz | Onde roda | Infra |
|------|-----------|-----------|-------|
| **SHALLOW** | Scrape via provedores configurados pelo usuário em `/api-models` + LLM analisa | Inngest | Reusa `web-research-providers.ts` + LLM API |
| **DEEP** | Browser headless persistente + agente LLM com controle total do browser | Sandbox E2B via Inngest | Browser Full Manager + LLM Agent |

### 0.3 Regras que eu quebrei (e não quebro de novo)

| Regra | O que eu propus (errado) | O correto |
|-------|-------------------------|-----------|
| `web-research-providers.ts` | "REMOVER — obsoleto" | **NÃO MEXER.** Tool do LLM de vibecoding. |
| Jina/HTTP/Browserless | "REMOVER" | **MANTER.** Shallow usa a config do usuário. Se user configurou Jina, usa Jina. |
| Fallback heap | "Zero fallback hardcoded" | **PARCIALMENTE CERTO.** Shallow respeita `webScrapeFallback` da config do usuário. Quem define fallback é o usuário em `/api-models`, não o código. |
| Edge function timeout | Shallow roda na Edge | **CORRIGIDO.** Tudo roda em Inngest (Edge Function timeout 30s é insuficiente). |

---

## 1. Arquitetura correta

```
                    ┌─── design DNA extraction ──────────────────────┐
                    │                                                │
                    │  SHALLOW (respeita /api-models do usuário)      │
                    │    └── web-research-providers.ts (reusa)        │
                    │        ├── Jina / Firecrawl / Browserless       │
                    │        │   (o que user configurou)              │
                    │        └── LLM API (modelo do user)            │
                    │                                                │
                    │  DEEP (Browser Full Manager)                    │
                    │    └── Sandbox E2B                              │
                    │        ├── Chrome persistente + CDP            │
                    │        ├── LLM agent com controle total        │
                    │        └── extrai CSS computed, motion, etc   │
                    │                                                │
                    │  AMBOS rodam em Inngest (não Edge Function)    │
                    └────────────────────────────────────────────────┘
```

---

## 2. Shallow — respeita 100% a config do usuário

### 2.1 Fluxo

```
Usuário em /api-models configurou:
  webScrapeProvider: "firecrawl"
  webScrapeFallback: "jina"
  LLM: "custom--openrouter--cohere/north-mini-code:free"

1. design-dna-extraction.ts lê agent_preferences
2. Chama scrapeWebPage(provider: "firecrawl")
3. Se falha → chama scrapeWebPage(provider: "jina")  ← fallback do USUÁRIO
4. Se ambos falham → erro propagado (fail closed)
5. LLM analisa o conteúdo
6. Salva em design_system_library
```

### 2.2 O que NÃO muda

| Arquivo | Status |
|---------|--------|
| `web-research-providers.ts` | **NÃO MEXER** — tool do vibecoding |
| `scrapeWebPage()` | **REUSAR** — shallow chama a mesma função |
| `scrapeViaJina()` | **MANTER** — se user configurou Jina |
| `scrapeViaFirecrawl()` | **MANTER** — se user configurou Firecrawl |
| `scrapeViaBrowserless()` | **MANTER** — se user configurou Browserless |

### 2.3 A única mudança no shallow

**HOJE** o shallow tem fallback hardcoded `jina → http` no código:
```typescript
const scrapeProvider = prefs?.webScrapeProvider ?? "jina";
const scrapeFallback = prefs?.webScrapeFallback
  ? prefs.webScrapeFallback
  : scrapeProvider === "jina" ? "http" : "jina";
```

**DEPOIS** respeita exclusivamente a config do usuário:
```typescript
const scrapeProvider = prefs?.webScrapeProvider;
const scrapeFallback = prefs?.webScrapeFallback;

if (!scrapeProvider) {
  throw new Error("Nenhum provedor de web scrape configurado em /api-models");
}
// Sem default hardcoded. Sem "jina" como padrão.
```

---

## 3. Deep — Browser Full Manager (minha proposta original, corrigida)

### 3.1 O que muda de verdade

**HOJE** o deep não é deep de verdade:
- Chrome nasce e morre por URL
- LLM é chamado da Edge (fora da sandbox)
- CDP nunca ativo
- Preview é placeholder

**DEPOIS** deep é realmente deep:
- Chrome persistente na sandbox com CDP ativo
- Agente LLM roda **dentro** da sandbox com controle total do browser
- Preview real (iframe funciona)
- Roda em Inngest (não Supabase Edge Function)

### 3.2 Browser Full Manager

```python
# Dentro da sandbox E2B:
# 1. Chrome inicia com --remote-debugging-port=9222
# 2. Fica vivo (E2B auto-pause/resume gerencia idle)
# 3. Agente LLM se conecta via connect_over_cdp
# 4. Preview: https://9222-<sandbox>.e2b.app (funciona de verdade)
# 5. Sem heartbeat — E2B já faz auto-pause 15min
```

### 3.3 LLM Agent (dual runtime)

| Runtime | Implementação | Quando usar |
|---------|--------------|-------------|
| Python | `browser_use.Agent` | Padrão — agent loop mais maduro |
| Node.js | `@browserbasehq/stagehand` | Alternativa — extract schema-driven |

O usuário configura qual usar em `/api-models` (`browserRuntimeProvider`).

---

## 4. Plano de PRs (HARDEST FIRST)

```
PR-1: Browser Full Manager (deep: Chrome persistente + CDP + preview real)
    ↓
PR-2: LLM Agent na sandbox (deep: agente Python/Node com browser control)
    ↓
PR-3: Shallow corrigido (respeita /api-models, sem fallback hardcoded)
    ↓
PR-4: Job state machine atômica (Inngest, não Edge)
    ↓
PR-5: UI preview real + progresso + erro
```

### PR-1 — Browser Full Manager

| Arquivo | O que faz |
|---------|-----------|
| `src/inngest/executor/browser-manager.ts` (NOVO) | `BrowserManager`: inicia Chrome persistente na sandbox, gerencia CDP, health check |
| `src/inngest/executor/e2b-client.ts` | Add `startChrome()` + `stopChrome()` + `isChromeAlive()` |
| `src/inngest/executor/run-design-dna.ts` | Substituir criação de sandbox burra por `BrowserManager.ensure()` |
| `supabase/functions/extract-design-dna/browser-setup.sh` (NOVO) | Script install: `pip install browser-use playwright` |
| `src/components/design-library/BrowserPreviewPanel.tsx` | Iframe real em vez de placeholder |
| `src/inngest/executor/web-research-providers.ts` | **NÃO MEXER** |

**Teste:** `curl https://9222-<sandbox>.e2b.app/json/version` → `{"Browser": "Chrome/..."}`

### PR-2 — LLM Agent na sandbox

| Arquivo | O que faz |
|---------|-----------|
| `src/inngest/executor/agent-runner.ts` (NOVO) | Orquestra agente: escreve script, define envs, executa, coleta resultado |
| `supabase/functions/extract-design-dna/agents/python/extract_dna.py` (NOVO) | Agente Python com Browser Use |
| `supabase/functions/extract-design-dna/agents/node/extract_dna.js` (NOVO) | Agente JS com Stagehand |
| `src/inngest/executor/design-dna-extraction.ts` | Extrair deep para módulo separado; shallow permanece (corrigido) |
| `src/inngest/executor/playwright-automation.ts` | **REMOVER** — substituído pelo agente |

### PR-3 — Shallow corrigido

| Arquivo | O que faz |
|---------|-----------|
| `src/inngest/executor/design-dna-extraction.ts` | Remover fallback hardcoded `jina→http`. Usar SÓ config do usuário. Fail closed. |
| `src/inngest/executor/run-design-dna.ts` | Validar config antes de começar |

**Regra de ouro do shallow:**
```typescript
// NÃO faça isso:
const provider = prefs?.webScrapeProvider ?? "jina";  // DEFAULT HARDCODED

// Faça isso:
if (!prefs?.webScrapeProvider) {
  throw new Error("Configure web scrape provider em /api-models");
}
```

### PR-4 — State machine + Inngest

| Arquivo | O que faz |
|---------|-----------|
| `src/inngest/functions/_shared-design-dna.ts` | `transitionJobStatus(from, to)` com gate |
| `src/inngest/functions/design-dna-extract.ts` | Simplificar: 1 loop (não 3), heartbeat removido (Inngest já gerencia) |

### PR-5 — UI

| Arquivo | O que faz |
|---------|-----------|
| `src/components/design-library/BrowserPreviewPanel.tsx` | iframe real, CDP health check, timeline |
| `src/components/design-library/DesignLibraryCard.tsx` | Mostrar DNA real (cores, typo) |

---

## 5. O que NÃO muda (não mexer)

| Arquivo | Por quê |
|---------|---------|
| `web-research-providers.ts` | Tool do LLM de vibecoding. Intocável. |
| `prompts.ts` | Prompts do DNA extraction. Mantidos. |
| `provider-wire.ts` | BUILTIN_RUNTIME. Mantido. |
| `_shared-design-dna.ts` | Só a state machine muda (transação). |
| `DesignLibraryCard.tsx` | Só adiciona exibição de DNA real. |
| `BrowserPreviewPanel.tsx` | Só troca placeholder por iframe. |

---

## 6. Resumo das correções que eu fiz

| O que eu disse (errado) | Como ficou (corrigido) |
|-------------------------|----------------------|
| "REMOVER web-research-providers.ts" | **NÃO MEXER** — tool do vibecoding |
| "REMOVER Jina/HTTP/Browserless" | **MANTER** — shallow respeita config do usuário |
| "Zero fallback hardcoded (sem fallback nenhum)" | **Fallback é configuração do usuário** — `webScrapeFallback` |
| "Heartbeat a cada 5min" | **REMOVER** — E2B auto-pause 15min, não precisa |
| Misturei vibecoding com DNA extraction | **SEPARAR** — são dois sistemas diferentes |
