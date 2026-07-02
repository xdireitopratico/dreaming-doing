# SPEC CANÔNICA — Design DNA Platform

**Versão:** 1.2  
**Status:** Fonte única de verdade do produto  
**Substitui:** specs/plans em `docs/superpowers/*design*`, `DESIGN_DNA_EXTRACTION_PLAN.md`, e qualquer doc que trate exemplos (BrowserUse, Refero, etc.) como arquitetura fixa.

---

## 0. O que este documento é

Máquina de produto em **etapas bloqueantes**. Cada etapa só começa quando a anterior passa no gate.

Destino final:

```
ARMAZENAR (Design Library + extract_design_dna)
    → CONSUMIR (VibeCoding LLM)
    → UTILIZAR (design_resolve → plano → build)
```

Tudo que a máquina precisa de fora vem do **usuário via API Models (Tools)**. Pré-requisito ausente = **fail closed** com mensagem acionável.

**Exemplos neste doc** (BrowserUse, Refero, portas, providers) são **ilustrações de capacidade**, não nomes obrigatórios no código.

---

## 1. Experiência alvo (inalterável)

### 1.1 Design Library — DEEP (Reality Show)

1. Usuário dispara extração DEEP de URL(s)
2. Painel full-screen: **iframe = browser real** navegando o site
3. Chat espelha o agente; usuário intervém sem matar o job
4. Timeline = log técnico (secundário)
5. Termina com **entrada na library** ou **falha permanente e legível**

### 1.2 Design Library — SHALLOW

1. Extração rápida em background (sem Reality Show obrigatório)
2. Usa **provedor de scrape** configurado pelo usuário
3. Termina com entrada na library ou falha legível

### 1.3 VibeCoding

1. `extract_design_dna` enfileira o **mesmo job** que a Design Library
2. DNA persiste em `design_system_library`
3. Agente aplica via skills → `design_resolve` → plano → build
4. `read_design_library` relê o armazém

### 1.4 Loop fechado

```
URL referência → Library (store) → VibeCoding (consume) → Craft (utilize)
```

---

## 2. Pré-requisitos do usuário (API Models)

### 2.1 SHALLOW — o que é obrigatório e por quê

| Pré-requisito | Obrigatório? | Por quê |
|---------------|--------------|---------|
| **LLM** (texto) | **Sim** | SHALLOW sintetiza DNA a partir de **markdown/HTML** devolvidos pelo scrape. O pipeline é `multiPassExtractDNA`: prompts por categoria + pass de síntese. Isso é trabalho de LLM em texto. |
| **Web scrape provider** (Tools) | **Sim** | Sem browser nosso no SHALLOW: o conteúdo da página entra via **um** provedor escolhido pelo usuário em API Models. |
| **LLM vision** | **Não** (fail closed) | Vision **enriquece** quando o scrape devolve screenshot (o código já anexa `image_url` se `screenshot` começa com `data:`). Sem imagem, o fluxo segue **só com texto** — ver `openAiChat` em `design-dna-extraction.ts`. SHALLOW não depende de navegação visual; depende de conteúdo estruturado + LLM. |
| **E2B** | **Não** | SHALLOW não monta sandbox. |

**Resumo SHALLOW:** LLM + scrape provider. Vision = bônus de qualidade, não gate.

### 2.2 DEEP — o que é obrigatório e por quê

| Pré-requisito | Obrigatório? | Por quê |
|---------------|--------------|---------|
| **LLM vision** | **Sim** | O loop agentico decide próximo passo com **screenshot**; síntese final usa evidência visual (CSS/DOM + imagens). Sem vision o agente opera cego — isso já falhou nos testes. |
| **E2B** (connector) | **Sim** | Browser nosso: Chromium no template, CDP, preview. Não há API de browser de terceiros como motor. |
| **Web scrape provider** | **Não** | O browser **é** o instrumento de leitura. Scrape HTTP é caminho de quem **não** tem sessão de browser. |

**Resumo DEEP:** E2B + LLM vision. Sem scrape API no fluxo canônico.

---

## 3. Duas operações canônicas, um armazém

### 3.1 Princípios

1. **Um armazém:** `design_system_library` — mesma fila (`design_dna_jobs`) para Library UI e VibeCoding
2. **Duas operações:** SHALLOW e DEEP — não roteador com N estratégias
3. **Fail closed** em pré-requisitos
4. **Resultado ou falha auditável** — nunca terminal vazio

### 3.2 SHALLOW (fluxo único)

```
resolveCapabilities(userId, "shallow")
  → exige: LLM + webScrapeProvider
  → não exige: vision, E2B

scrapeViaUserProvider(url)          // 1 provider, sem cadeia de fallback

collectEvidence(shallow)            // markdown, html, screenshot se o scrape trouxer

multiPassExtractDNA(evidence)       // vision só se screenshot data: URL presente

validateDNA()

persistLibraryEntry()               // OU job.failed + errors[] + evento
```

### 3.3 DEEP (fluxo único)

```
resolveCapabilities(userId, "deep")
  → exige: LLM vision + E2B

ensureSandbox(E2B template)
ensurePreview(sandbox)              // previewUrl REAL (≠ porta CDP)

runAgentLoop(CDP + vision LLM)      // explore + design_dna_instructions

collectEvidence(deep)               // CDP + nosso collector (agent.py ou equivalente TS)

multiPassExtractDNA(evidence)       // vision obrigatória no loop e na síntese

validateDNA()

persistLibraryEntry()               // OU job.failed + audit
```

### 3.4 Consumo e utilização (VibeCoding)

```
extract_design_dna → design-dna-scheduler (mesmo job)
read_design_library(source_url)
design_resolve(library entries + manifest seeds)   // library tem prioridade
create_plan.design.references
build
```

**Manifest seeds** (`forge-ui`) = catálogo bootstrap interno.  
**Library** = DNA vivo do usuário. Os dois alimentam `design_resolve`; library primeiro.

---

## 4. Contratos de dados

### 4.1 Persistência (`design_system_library`)

Obrigatório para `completed`: `source_url`, `name`, `design_dna` (campos core), `quality_score`, `confidence`, proveniência (`provider_trace`, `extracted_by`, `ingest_kind`), conteúdo bruto quando disponível.

### 4.2 Job terminal (UX)

| Status | Significado |
|--------|-------------|
| `completed` | DNA na library |
| `failed` | `errors[]` preenchido, motivo visível, permanente |
| `canceled` | Usuário cancelou |

### 4.3 `previewUrl` (só DEEP)

- Em `job.meta` antes do agent loop
- Iframe carrega essa URL
- Mesmo browser que o CDP controla
- Implementação: evolução do template E2B (live view) — ver §9 e Etapa 4

---

## 5. Post-mortem — por que o preview nunca funcionou

> Seção obrigatória para não repetir o erro de “achar que funcionava porque a timeline mostrava eventos”.

### 5.1 O que parecia funcionar (e enganou)

- Sandbox subia (`sandbox_setup`, `sandbox_ready`, `chrome_cdp_ready`)
- Timeline recebia eventos `agent_*` via Realtime
- `job.meta.previewUrl` era preenchido
- Logo “Chrome CDP pronto” dava falsa sensação de preview ok

**A timeline não é o preview.** Eventos provam backend; preview prova viewport visível ao usuário.

### 5.2 Causa raiz 1 — URL errada no iframe

**Arquivo:** `src/inngest/executor/run-design-dna.ts`  
**Hoje:** `previewUrl = https://9222-{sandboxId}.e2b.app` (`PREVIEW_PORT = 9222`)

A porta 9222 é **Chrome DevTools Protocol** (WebSocket/JSON), não uma página HTML renderizada. O iframe em `BrowserPreviewPanel.tsx` faz `src={previewUrl}` esperando um documento visual.

**Erro de design:** confundir “porta exposta pelo E2B” com “viewport do browser”.

### 5.3 Causa raiz 2 — Chromium headless no template

**Arquivo:** `e2b-template/template.ts`  
Chromium sobe com `--headless=new` e `--remote-debugging-port=9222`. Headless não publica framebuffer HTTP para humanos; CDP controla o browser, não o exibe.

**Erro de design:** docs (`e2b-template/README.md`) afirmam que iframe em `:9222` “funciona de verdade” — isso nunca foi gate manual (G4).

### 5.4 Causa raiz 3 — iframe estático vs navegação do agente

Mesmo com `previewUrl` setado, o iframe **não** segue a URL que o agente navega (`unrealengine.com`, etc.). Só mudaria se:

- o `previewUrl` mostrasse o **mesmo** Chrome que o CDP controla (live view), ou
- o frontend atualizasse `iframe.src` para a URL externa (errado: seria o browser do usuário, não o sandbox)

**Hoje:** `executeAction(navigate)` tenta `iframeRef.src = url` após 500ms — isso carrega o site **fora** do sandbox (sem cookies/anti-bot do agente). Não é Reality Show.

### 5.5 Causa raiz 4 — CDP possivelmente inoperante no loop

**Arquivo:** `src/inngest/executor/browser-cdp-websocket.ts`  
Conexão no root do browser sem `Target.attachToTarget` / seleção de aba. `Page.navigate` pode falhar silenciosamente; timeline mostra `👁 navigate` **sem** sucesso/erro no rótulo.

**Efeito:** agente em loop, preview vazio ou estático, usuário sem feedback visual.

### 5.6 Causa raiz 5 — chat desacoplado do agente

**Arquivo:** `BrowserPreviewPanel.tsx`  
Eventos `agent_*` só aparecem na timeline. Chat usa `design-library-chat` (SSE genérico). Usuário não vê o agente “pensar” no painel principal — reforça sensação de preview morto.

### 5.7 Anti-padrões — nunca mais

| # | Anti-padrão | Correção canônica |
|---|-------------|-------------------|
| A1 | Usar porta CDP como `previewUrl` | `previewUrl` = live view server no sandbox (Etapa 4) |
| A2 | Declarar preview ok porque `chrome_cdp_ready` disparou | Gate G4 manual: iframe mostra site mudando |
| A3 | Atualizar iframe com URL externa pós-navigate | Preview espelha sandbox; navigate é via CDP no mesmo browser |
| A4 | Timeline como única superfície de feedback | Chat espelha `agent_*`; timeline fica técnica |
| A5 | Aceitar spec/README como verdade sem gate | Só este doc + G4 evidenciado |

### 5.8 O que precisa existir para o preview funcionar (contrato técnico)

1. Template E2B sobe **live view** (ex.: headed Chrome + servidor de visualização em porta dedicada ≠ 9222)
2. `ensurePreview()` grava `meta.previewUrl` **antes** do agent loop
3. CDP e live view compartilham **a mesma sessão** de browser
4. Frontend: iframe só usa `previewUrl`; **não** reatribui `src` para URL externa
5. Gate G4 bloqueia Etapas 5–6 até passar

---

## 6. Diagnóstico — o que fica e o que sai

### FICA (evoluir)

- `design_system_library`, `design_dna_jobs`, `design_dna_events`, `design_dna_instructions`
- `design-dna-scheduler`, Inngest `design-dna-extract`
- `extractDesignDnaForUrl` (refatorado: 2 modos explícitos, sem router)
- `multiPassExtractDNA`, `validateDNA`, `prompts.ts`
- `BrowserPreviewPanel`, Design Library UI
- `extract_design_dna`, `read_design_library`
- `design_resolve`, forge-ui manifest
- `e2b-template`, collectors CDP / `agent.py`
- `web-research-providers.ts` — **intocável** (tool do VibeCoding para pesquisa, não é Design DNA)

### SAI

- `browser-agent-synthesis.ts` e fork paralelo no DEEP
- `referoScrape` roteador multi-estratégia como caminho de produção
- Preview em porta CDP (`9222`) como iframe
- Fallbacks hardcoded de scrape (jina→firecrawl no código)
- Specs antigos como fonte de implementação
- Novos módulos `browser-*` sem gate manual de preview

### Lacuna a fechar (Etapa 7)

`design_resolve` hoje prioriza IDs do manifest; library entries devem entrar com prioridade via `source_url` / `library_entry_id`.

---

## 7. Refatoração frontend (Design Library)

> O backend pode estar “rodando”; sem estes itens a UX continua quebrada mesmo após G4/G5.

### 7.1 `BrowserPreviewPanel.tsx` (crítico — Reality Show)

| Item | Hoje | Deve ser |
|------|------|----------|
| Preview | `iframe src={previewUrl}` ou placeholder | iframe só com `previewUrl` canônico; estado `onError` com mensagem + link diagnóstico |
| Navigate side-effect | `iframeRef.src = url` externa em `executeAction` | **Remover** — navigate é só CDP; preview atualiza sozinho via live view |
| Chat vs agente | Chat = SSE `design-library-chat`; agente só na timeline | Espelhar `agent_thought/action/observation` como mensagens no chat |
| Instruções em runtime | `postInstruction` quando job ativo | Manter; garantir feedback visual no chat quando consumida |
| Timeline | `👁 navigate` sem sucesso/erro | Rótulo com ✓/✗ + resumo do `observation.error` |
| Eventos terminais | `quality_error` só na timeline | Banner no header: score, motivo, link para `job.errors` |
| Quick actions | Bloco **duplicado** (linhas ~883–911) | Um bloco só |
| Job terminal | Timeline para de subscribe (`useJobEvents(null)`) mas histórico pode sumir | Sempre `fetchJobEvents` no mount; banner “Encerrado” + resultado/falha |
| Action chips | `disabled={!previewUrl \|\| isTerminal}` | Habilitar quando sandbox ativo; não depender de preview CDP errado |
| Thinking stream | Só para chat SSE | Também para passos do agente quando aplicável |

### 7.2 `DesignLibraryPage.tsx`

| Item | Hoje | Deve ser |
|------|------|----------|
| Jobs recentes | Badge `status` apenas | Expandir: `failed` mostra `job.error` / primeiro `errors[]` |
| Pós-job | Nenhum refresh automático da library | Ao fechar Reality Show com `completed`, `reloadEntries()` |
| SHALLOW | Abre Reality Show? | SHALLOW: toast + barra de progresso; DEEP: abre Reality Show automaticamente |
| Capabilities | Não valida pré-requisitos antes de criar job | Pré-check E2B (deep) / scrape+LLM (shallow) com mensagem API Models |

### 7.3 `hooks.ts`

| Item | Hoje | Deve ser |
|------|------|----------|
| `useJobEvents` | Limpa events quando terminal | Manter fetch inicial; Realtime só enquanto `running` |
| `useJobPolling` | `meta.previewUrl` via Realtime | Ok; garantir que backend atualiza meta antes de eventos agent |
| `useDesignDnaInstructions` | Existe mas panel não usa | Wire no chat: lista instruções consumidas/pending |

### 7.4 `DesignLibraryDetail.tsx`

| Item | Hoje | Deve ser |
|------|------|----------|
| Audit | Mostra entry validada | Mostrar também `provider_trace`, `blocked_reason`, qualidade rejeitada se entry `rejected` |
| Preview tab | Screenshot estático | Manter; opcional link “ver job de extração” se existir |

### 7.5 `api.ts` / `types.ts`

- Tipar `job.errors`, `job.meta.progress`, eventos `quality_error` / `validation_rejected`
- `fetchJobDetails` deve trazer `errors` para UI terminal
- Remover tipos mortos se módulos backend forem deletados (Etapa 5)

### 7.6 `ServiceHealthBar.tsx`

- Refletir pré-requisitos reais: E2B configurado, LLM configurado, scrape (shallow) — não “provider X por nome de marketing”

### 7.7 Gate frontend (G6)

- [ ] iframe mostra browser em movimento durante job DEEP
- [ ] chat mostra pelo menos 1 ciclo thought → action → observation
- [ ] instrução do usuário aparece e é consumida (evento ou lista)
- [ ] job `failed` mostra motivo sem expandir JSON na timeline
- [ ] zero blocos UI duplicados no panel

---

## 8. Hygiene — inventário explícito ao final

> “Higienizar” = mover, corrigir ou deletar. Nada fica em limbo. Cada item liga a um gate.

### 8.1 Documentação (Etapa 0 — G0)

**Mover para `docs/HISTORICAL/` (não deletar ainda):**

| Arquivo |
|---------|
| `docs/superpowers/specs/2026-07-01-browser-agent-deep-design.md` |
| `docs/superpowers/plans/2026-07-01-browser-agent-deep.md` |
| `docs/superpowers/specs/2026-06-30-designer-library-production-design.md` |
| `docs/superpowers/plans/2026-06-30-designer-library-production.md` |
| `docs/DESIGN_DNA_EXTRACTION_PLAN.md` |

**Corrigir (não arquivar):**

| Arquivo | Correção |
|---------|----------|
| `e2b-template/README.md` | Remover afirmação de iframe em `:9222`; apontar para §5 desta spec |
| `skills/extract-design/SKILL.md` | Alinhar async/blocking com comportamento real de `extract_design_dna` |

**Única fonte de verdade:** `docs/DESIGN_DNA_CANONICAL_SPEC.md`

### 8.2 Backend — deletar após Gate G5

| Arquivo | Motivo |
|---------|--------|
| `src/inngest/executor/browser-agent-synthesis.ts` | Síntese paralela fraca |
| `src/inngest/executor/browser-agent-synthesis.test.ts` | Testa módulo removido |

**Refatorar / fundir (não duplicar):**

| Arquivo | Ação |
|---------|------|
| `src/inngest/executor/run-design-dna.ts` | Bloco DEEP → `runDeepExtraction()` único |
| `src/inngest/executor/design-dna-extraction.ts` | SHALLOW sem `referoScrape` router; DEEP não passa pelo router |
| `src/inngest/executor/refero/refero-router.ts` | Congelar; não usar em produção canônica (funções úteis inlined ou import pontual) |
| `src/inngest/executor/browser-agent-runner.ts` | Manter só loop explore se G5 validar; senão fundir em `runDeepExtraction` |
| `src/inngest/executor/browser-cdp-websocket.ts` | Page attach obrigatório (G4) |

### 8.3 Backend — corrigir (Etapa 4, antes de G5)

| Arquivo | Correção |
|---------|----------|
| `e2b-template/template.ts` | Live view + `previewUrl` canônico |
| `src/inngest/executor/run-design-dna.ts` | `ensurePreview()` separado de CDP port |
| `src/inngest/executor/browser-agent-llm.ts` | Vision no payload |

### 8.4 Frontend — hygiene (Etapa 6, G6)

| Arquivo | Ação |
|---------|------|
| `BrowserPreviewPanel.tsx` | §7.1 inteiro |
| `DesignLibraryPage.tsx` | §7.2 |
| `hooks.ts` | §7.3 |

### 8.5 Scripts / smoke (Etapa 8 — G8)

| Item | Ação |
|------|------|
| `scripts/smoke-design-library-e2e.mjs` | Reescrever contra fluxo canônico G3+G5 |
| `scripts/smoke-design-library-e2e.mjs` (deprecated marker) | Remover aviso “deprecated” após novo smoke passar |
| `e2b-template/test-inngest-path.mjs` | Adicionar assert de `previewUrl` HTTP 200 + conteúdo visual |

### 8.6 O que **não** higienizar (intocável)

- `supabase/functions/_shared/web-research-providers.ts` (VibeCoding web research)
- `packages/forge-ui` manifest/seeds (bootstrap interno)
- Tabelas `design_system_library`, `design_dna_jobs` (evoluir schema, não dropar)

### 8.7 Critério “hygiene completa” (G8)

- [ ] Zero imports de `browser-agent-synthesis`
- [ ] Zero referência a spec em `docs/HISTORICAL/` em código novo
- [ ] `referoScrape` não chamado nos caminhos SHALLOW/DEEP canônicos
- [ ] README E2B alinhado com G4
- [ ] Frontend §7.7 checklist verde
- [ ] Smoke canônico documentado no próprio script (como rodar + pré-requisitos)

---

## 9. Super plano — etapas e gates

| Etapa | Objetivo | Gate |
|-------|----------|------|
| **0** | Hygiene: este doc = verdade; specs antigos → `docs/HISTORICAL/` | G0: PRs não citam spec antiga |
| **1** | `resolveExtractionCapabilities(userId, depth)` fail closed | G1: job sem pré-requisito → failed + mensagem API Models |
| **2** | Um escritor `persistLibraryEntry`; rejeição visível | G2: zero terminal vazio |
| **3** | SHALLOW canônico (1 scrape, multiPass, validate) | G3: 1 URL → library ou failed legível |
| **4** | Infra DEEP: preview real + CDP page attach + vision no loop | G4: iframe navega; navigate muda preview |
| **5** | DEEP canônico `runDeepExtraction()`; deletar fork | G5: 1 URL deep → library ou failed |
| **6** | Reality Show UX: chat espelha agente | G6: teste manual completo |
| **7** | Library → design_resolve → build | G7: E2E VibeCoding com referência |
| **8** | Hardening, smoke, métricas, email | G8: suite verde |

**Ordem bloqueante:** G0 → G1 → G2 → **G3** → **G4** (bloqueia DEEP) → G5 → G6 → G7 → G8.

**Hygiene:** §8.1 no G0 · §8.3 no G4 · §8.2 no G5 · §8.4 no G6 · §8.5–8.7 no G8.

---

## 10. Definição de pronto (produto completo)

1. SHALLOW: URL → library com LLM + scrape configurados (vision opcional)
2. DEEP: preview ao vivo + agente + library ou falha legível
3. VibeCoding e Library UI usam o **mesmo** job queue
4. `design_resolve` consome library, não só manifest
5. Build reflete DNA da referência
6. Zero pipeline paralelo de síntese
7. Usuário configura só API Models; máquina fail closed

---

## 11. Changelog desta spec

| Versão | Mudança |
|--------|---------|
| 1.0 | Rascunho inicial (chat) |
| 1.1 | SHALLOW: LLM texto obrigatório; vision **não** obrigatório. DEEP: vision obrigatório. Doc salvo em repo. |
| 1.2 | §5 post-mortem preview; §7 refatoração frontend; §8 hygiene inventário explícito com gates. |