# Plano de Inflexão v2 — Design Agent FORGE

**Versão:** 2.1  
**Data:** 2026-06-24  
**Status:** Em implementação — commits direto em `main`  
**Horizonte:** ~24 meses sem redesign arquitetural

---

## 0. Autocrítica do v1 (por que nota 5 era justa)

O v1 descreveu **arquitetura desejada** sem **mapa cirúrgico de implementação**. Falhas concretas:

| Falha do v1 | Evidência no repo hoje |
|-------------|------------------------|
| "Ligar synthesis" como se bastasse | `synthesize()` existe em `packages/forge-ui/src/synthesis/engine.ts` mas **nenhum arquivo em `agent-run` importa** |
| "Tool design_resolve" sem especificar onde registrar, quem chama, schema | Não existe tool; `registry.ts` só tem padrão `reg.register()` em `tools/*.ts` |
| Não listou **bugs ativos** que sabotam o fluxo | `CREATE_PLAN_TOOL` **não declara** campo `design` no JSON schema — LLM é instruído a usar, mas a tool não expõe |
| Não disse que preflight **injeta mentira** | `buildAvailableComponentsManifest()` lista 38 composites incluindo 29 fantasmas |
| Não disse que enforcement **premia genérico** | `scanProjectForLandingQuality` só exige ≥3 nomes de `KNOWN_FORGE_COMPOSITES` + `FadeIn` — passa com `ServiceGrid` (fantasma) |
| Não disse que Build **ignora design** no loop | `execute.ts:227` chama `buildExecuteInstruction` **sem** passar `design`; só screenshots vão via `run-job.ts` |
| Gaps P1–P4 sem spec de arquivo | Lista de nomes, não contrato `Technique` nem props de composição |
| "CI falha se manifest desatualizado" | Não existe script nem hook — só `bundle-forge-ui-seed.mjs` |

**Este v2 corrige:** cada mudança tem **arquivo, função, diff conceitual, teste de aceite e risco de regressão**.

---

## 1. Cadeia causal — por que o preview é sempre Hero+Bento+preto/amarelo

```
Usuário pede landing
    ↓
buildForgeAgentSystemInput() injeta DESIGN_GUIDE (prompts.ts:17-63)
    → lista só 9 composites básicos; ZERO das 11 opinionated
    ↓
Skill design-system ativa (skills.ts:159-221)
    → exemplo literal: import { HeroSignature, BentoGrid }
    ↓
CREATE_PLAN (opcional) — campo design NÃO está no schema da tool (meta.ts:60-114)
    → LLM inventa ou omite; synthesis/critic nunca rodam
    ↓
Plano aprovado → buildDesignDirectiveBlock (run-job.ts:124-167)
    → voice/moment/techniques em prosa; SEM composition ids, SEM fs_read paths, SEM relevant_dnas
    ↓
Build loop (execute.ts) — buildExecuteInstruction SEM design
    ↓
Preflight injeta manifest falso (design-preflight.ts:99-106)
    → "ProcessSteps, LogoWall existem" — não existem
    ↓
Observer (observer.ts:354-403) — só bloqueia deep import @forge/ui
    → scanProjectForLandingQuality premia qualquer 3 nomes + FadeIn
    ↓
Resultado: caminho de menor resistência = HeroSignature + BentoGrid + bg-zinc-950
```

**Conclusão:** não é falta de biblioteca (`forge-ui` ~7k LOC). É **pipeline que mente, premia genérico e não executa síntese**.

---

## 2. Inventário verificado (2026-06-24)

### 2.1 Biblioteca (`packages/forge-ui`) — EXISTE, exportada no seed

| Ativo | Qtd | Arquivo âncora | Export `@forge/ui` |
|-------|-----|------------------|-------------------|
| Composites básicos | 9 | `composites/*.tsx` | Sim |
| Composições opinionated | 11 | `compositions/opinionated/` | Sim (`composites/index.ts:15-32`) |
| Técnicas | 12 | `techniques/*.ts` | Sim (`TECHNIQUE_BY_ID`) |
| DNA seeds | 14 | `design-dna/seeds.ts` | Sim |
| Linguagens visuais | 12 | `tokens/languages.ts` | Sim |
| Synthesis | 1 | `synthesis/engine.ts` | Sim, **não usado** |
| Design critic | 1 | `design-critic/critic.ts` | Sim, **não usado** |
| Motion primitives | 20+ | `components/Motion.tsx` | Sim |

### 2.2 Agente (`supabase/functions/agent-run`) — O QUE REALMENTE RODA

| Componente | Arquivo | Estado |
|------------|---------|--------|
| System prompt design | `prompts.ts` `DESIGN_GUIDE` | Ativo; omite opinionated |
| Skill design | `skills.ts` L159-221 | Ativo; ancora Hero+Bento |
| Enforcement | `design-enforcement.ts` | 38 nomes, 29 fantasmas |
| Preflight manifest | `design-preflight.ts` L99-106 | Propaga fantasmas ao context |
| Preflight phase | `runtime/phases/design-preflight-phase.ts` | Roda no build; injeta manifest |
| Plan design field | `tools/meta.ts` `proposedPlanFromToolArgs` | Parser existe L261-298 |
| **create_plan schema** | `tools/meta.ts` `CREATE_PLAN_TOOL` L60-114 | **SEM propriedade `design`** |
| Design no plano aprovado | `run-job.ts` `buildDesignDirectiveBlock` | Parcial (sem DNA/compositions) |
| Build instruction | `runtime/phases/execute.ts` L227-230 | **Não recebe design** |
| Observer design | `observer.ts` `checkDesignSystem` | Só deep import blocking |
| Synthesis import | — | **Inexistente** |
| Critic import | — | **Inexistente** |
| `compositionCatalogSummary` | `forge-ui` | **Nunca injetado** |
| `designDnaCatalogSummary` | `forge-ui` | **Nunca injetado** |

### 2.3 Os 14 DNA seeds — o que são e o que mudam

| Fato | Detalhe |
|------|---------|
| Origem | Commit `0f9a28f` (2026-06-20), curadoria manual |
| Arquivo | `packages/forge-ui/src/design-dna/seeds.ts` (799 linhas) |
| Natureza | Átomos estruturados (layout, motion, typo, cor) — não screenshots |
| Para o LLM hoje | **Zero efeito** — não entram em prompt, preflight, nem build |
| Para o LLM após v2 | Vocabulário via `design_resolve` → 2 IDs + resumo 500 chars cada |
| DNA do usuário | Pipeline `extract_design_dna` + Inngest existe; merge no resolve é **construir** |

### 2.4 Cobertura das 11 composições (pontapé inicial)

| Métrica | % | Nota |
|---------|---|------|
| Seções landing tipadas (21 padrões mercado) | ~35% | Faltam tabs, steps, FAQ, demo, vídeo, liquid, WebGL |
| Impacto hero + scroll + superfície | ~55-65% | Com técnicas, aproxima LiveKit estático |
| Interatividade avançada | ~10-15% | Gap principal pós-infração |
| **Visibilidade para o LLM** | **0%** | Não estão em DESIGN_GUIDE, skill, preflight nem enforcement |

---

## 3. Gaps — severidade e resolução concreta

Legenda: **WIRE** = conectar existente | **BUILD** = código novo | **FIX** = corrigir bug | **DELETE** = remover mentira

### P0 — Bloqueadores (sem isso, nada muda)

| ID | Gap | Resolução | Tipo |
|----|-----|-----------|------|
| G0 | `CREATE_PLAN_TOOL` sem `design` no schema | Adicionar `design` object com voice, moment, techniques, mood, references, anti_patterns, synthesis_reasoning, relevant_dnas, **compositions**, **read_paths** | FIX |
| G1 | Skill ensina Hero+Bento | Renomear `design-system` → `forge-design`; reescrever `systemPrompt`; remover exemplo Hero+Bento | FIX |
| G2 | 29 composites fantasmas no enforcement + preflight | Gerar manifest verdadeiro; enforcement só aceita manifest | BUILD+FIX |
| G3 | Synthesis/critic mortos | Módulo `design-resolve.ts` chama `synthesize()` + `reviewSynthesis()` + `findCompositions()` | WIRE+BUILD |
| G4 | Build não recebe pacote técnico | `DesignPlanField` ganha `compositions[]`, `read_paths[]`; propagate em execute + observer | BUILD |
| G5 | Observer premia genérico | Substituir contagem por `design_validate` assinatura-based | BUILD |

### P1 — Retrieval (LLM lê 250-350 linhas, não 7k)

| ID | Gap | Resolução |
|----|-----|-----------|
| G6 | Sem manifest gerado | `scripts/generate-design-manifest.mjs` + `design_manifest.generated.json` |
| G7 | Sem tool de resolve | `tools/design.ts` — `design_resolve` (Plan) e `design_validate` (Build) |
| G8 | Sem gate fs_read | `execute-helpers.ts` — bloquear 1º patch UI sem ler `read_paths` |
| G9 | DESIGN_GUIDE duplicado e errado | Encurtar para ponteiro: "ver skill forge-design + manifest Tier 0" |

### P2 — Gaps visuais (construir, não rezar)

| ID | Gap mercado | Entrega BUILD |
|----|-------------|---------------|
| G10 | Tabs Voice/Video/Robotics | Técnica `section-tabs-visual` + composição `SectionTabsFeatureLanes` |
| G11 | How it works | Técnica `process-steps-scroll` + composição `ProcessStepsHowItWorks` |
| G12 | Smooth scroll premium | Técnica `smooth-scroll-lenis` (port de `src/lib/smooth-scroll.tsx`) |
| G13 | FAQ conversão | Composição `FAQAccordionCraft` (substitui phantom FAQAccordion) |
| G14 | Logo cloud | Técnica `logo-marquee-social-proof` (extends infinite-marquee) |
| G15 | Demo no hero | Composição `InteractiveHeroDemo` + técnica `interactive-demo-embed` |

### P3 — Ano 2 (não bloqueia inflexão)

View transitions, liquid blob, video hero, WebGL light — specs no Apêndice D.

---

## 4. Mapa cirúrgico de arquivos

Cada entrada: **problema → mudança → teste → não tocar**.

### 4.1 Camada prompt/skill (P0)

#### `supabase/functions/agent-run/skills.ts`

| Linha | Problema | Mudança |
|-------|----------|---------|
| L159 `name: "design-system"` | Nome e conteúdo ancora template | Renomear `forge-design` |
| L167-169 | `import { HeroSignature, BentoGrid }` | Exemplo: `HeroCinematicSpotlight` OU `StickyStackNarrative` — escolha via resolve, não default |
| L171 | "≥3 composites" sem distinção | "≥3 seções; hero DEVE ser opinionated quando brief pede craft" |
| L208-211 | Observer rules genéricas | Referenciar `design_validate` + manifest |

**Teste:** `skills.test.ts` (novo) — snapshot `systemPrompt` não contém `HeroSignature` como exemplo default.

**Risco:** runs antigas referenciam `design-system` no timeline — manter alias `design-system` → `forge-design` por 1 release em `skills.ts` `getActiveSkills`.

#### `supabase/functions/agent-run/prompts.ts`

| Linha | Problema | Mudança |
|-------|----------|---------|
| L40-44 | Catálogo só 9 básicos | Substituir por: "11 opinionated + 9 básicos — ver `design_manifest` injetado" |
| L46-59 | Lista 12 técnicas manual | Manter nomes; adicionar "paths no manifest" |
| L17-63 inteiro | ~2.5k chars duplicando skill | Reduzir para ~800 chars + ponteiro skill |

**Teste:** `agent-system-input.test.ts` — `buildForgeAgentSystemInput` inclui manifest quando flag ativa; não inclui `ProcessSteps`.

#### `supabase/functions/agent-run/agent-system-input.ts`

| Linha | Mudança |
|-------|---------|
| L75 | Após `DESIGN_GUIDE`, injetar `buildDesignManifestSummary()` (~6-8k chars) quando `FORGE_DESIGN_MANIFEST=1` |

**Novo import:** `design-manifest.ts` (ver §5.1).

---

### 4.2 Camada mentira → verdade (P0)

#### `supabase/functions/agent-run/design-enforcement.ts`

| Linha | Problema | Mudança |
|-------|----------|---------|
| L7-46 `KNOWN_FORGE_COMPOSITES` | 29 fantasmas | **DELETE lista hardcoded.** Importar de `design_manifest.generated.json` |
| L77-78 `countForgeComposites` | Conta strings, não imports | `countManifestImports(code, manifest)` — regex `from "@forge/ui"` + nomes exportados |
| L123-161 `scanProjectForLandingQuality` | ≥3 nomes + FadeIn | Validar: (1) hero opinionated OU técnica mesh/parallax se brief pediu; (2) ≥1 técnica do pacote resolve; (3) anti `HeroSignature+BentoGrid` sem resolve |
| L140-146 | Motion = só FadeIn family | Aceitar `Parallax`, `Reveal`, `StaggerContainer`, `useScrollProgress` |

**Teste:** reescrever `design-enforcement.test.ts` L22-41 — `ServiceGrid` **deve falhar**; `HeroCinematicSpotlight` deve passar.

#### `supabase/functions/agent-run/design-preflight.ts`

| Linha | Problema | Mudança |
|-------|----------|---------|
| L99-106 `buildAvailableComponentsManifest` | Lista fantasmas | `buildAvailableComponentsManifest(manifest)` — só exports reais + opinionated |
| L46 `state.context.projectConfig` | Injeta mentira | Injetar manifest summary + `phantom_banned` explícito |

**Teste:** `design-preflight.test.ts` L51-55 — manifest NÃO contém `ProcessSteps`.

---

### 4.3 Camada plan → build (P0)

#### `supabase/functions/agent-run/tools/meta.ts`

| Linha | Problema | Mudança |
|-------|----------|---------|
| L60-114 `CREATE_PLAN_TOOL.parameters` | Sem `design` | Adicionar schema completo (espelha `DesignPlanField` + novos campos) |
| L261-298 parser | Sem compositions/read_paths | Parsear `compositions: string[]`, `read_paths: string[]` |

**Schema `design` proposto (adicionar em properties):**
```json
{
  "design": {
    "type": "object",
    "properties": {
      "voice": { "type": "array", "items": { "type": "string" } },
      "moment": { "type": "string" },
      "techniques": { "type": "array", "items": { "type": "string" } },
      "mood": { "type": "string" },
      "compositions": { "type": "array", "items": { "type": "string" }, "description": "IDs opinionated do manifest" },
      "relevant_dnas": { "type": "array", "items": { "type": "string" } },
      "read_paths": { "type": "array", "items": { "type": "string" }, "description": "Paths obrigatórios fs_read no Build" },
      "references": { "type": "array", "items": { "type": "object", "properties": { "url": { "type": "string" } } } },
      "anti_patterns": { "type": "array", "items": { "type": "string" } },
      "synthesis_reasoning": { "type": "string" }
    },
    "required": ["voice", "moment", "techniques"]
  }
}
```

**Teste:** `meta.test.ts` — create_plan com design persiste compositions + read_paths.

#### `supabase/functions/agent-run/types.ts`

| Linha | Mudança |
|-------|---------|
| L147-166 `DesignPlanField` | Adicionar `compositions?: string[]`, `read_paths?: string[]`, `resolve_id?: string` |

#### `supabase/functions/agent-run/run-job.ts`

| Linha | Problema | Mudança |
|-------|----------|---------|
| L124-167 `buildDesignDirectiveBlock` | Sem DNA/compositions/paths | Incluir compositions, relevant_dnas, read_paths com instrução "fs_read OBRIGATÓRIO antes do 1º patch" |

#### `supabase/functions/agent-run/runtime/phases/execute.ts`

| Linha | Problema | Mudança |
|-------|----------|---------|
| L227-230 | Sem design no instruction | Passar `approvedDesign` de deps |
| Antes L175 preflight | Sem resolve gate | Se `read_paths` não lidos → injetar user message bloqueante |

**Novo em deps:** `approvedDesign?: DesignPlanField`, `designReadPathsDone: Set<string>`.

#### `supabase/functions/agent-run/runtime/phases/plan-turn.ts`

| Linha | Mudança |
|-------|---------|
| Antes `create_plan` handler | Se step envolve UI: **forçar** chamada `design_resolve` tool OU auto-preencher design via `resolveDesignPackage()` determinístico |

**Decisão v2:** Plan mode chama `design_resolve` **automaticamente no host** quando detecta UI no pedido — LLM não decide se usa ou não.

---

### 4.4 Novos módulos (BUILD)

#### `supabase/functions/agent-run/design-manifest.ts` (NOVO)

```typescript
// Lê design_manifest.generated.json (commitado)
export function loadDesignManifest(): DesignManifest;
export function buildDesignManifestSummary(): string;  // ~6-8k chars Tier 0
export function isExportValid(name: string): boolean;
export function getPhantomBanned(): string[];
```

**Fonte:** JSON gerado por script — não parsear TS em runtime Deno.

#### `supabase/functions/agent-run/design-resolve.ts` (NOVO)

Port determinístico — **não importar `@forge/ui` no Edge** (bundle). Duplicar lógica mínima OU embed manifest + regras:

```typescript
export type DesignResolveInput = {
  domain: string;
  sections?: string[];  // hero, features, pricing, faq...
  references?: string[];
  moodOverride?: string;
  excludeVoices?: string[];
  excludeTechniques?: string[];
};

export type DesignResolvePackage = {
  proposal: SynthesisProposal;      // espelha forge-ui
  compositions: string[];           // 2 ids
  techniques: string[];             // 3 ids
  relevant_dnas: string[];          // 2 ids
  read_paths: string[];             // 3-5 paths sandbox
  anti_patterns: string[];
  critic: CriticResult;
  summary: string;                  // <2.5k chars para plan
};

export function resolveDesignPackage(input: DesignResolveInput): DesignResolvePackage;
```

**Algoritmo (determinístico, zero LLM):**
1. `suggestMoodForDomain(domain)` — tabela em manifest
2. `suggestLanguagesForDomain(domain)` − excludes
3. `findBestCombination` — copiar lógica de `synthesis/engine.ts` (ou JSON de decisões pré-computadas)
4. `selectTechniques(voice)` — max 3, não repetir excludeTechniques
5. `findCompositions(voice, moment, mood)` — top 2 por score
6. `selectRelevantDnas` — top 2 do manifest dna_seeds
7. `read_paths` = composition code_paths + technique file_paths (manifest)
8. `reviewSynthesis(proposal)` — se fail, fallback voice `["swiss","editorial"]` + re-run
9. Hash `(domain + projectId)` para rotação anti-repetição entre projetos

**Teste:** `design-resolve.test.ts` — "fintech saas" ≠ "padaria artesanal" em compositions; critic pass; summary < 2500 chars.

#### `supabase/functions/agent-run/design-validate.ts` (NOVO)

```typescript
export type ValidateInput = {
  expected: DesignResolvePackage;
  files: Map<string, string>;  // sandbox contents
};

export function validateDesignImplementation(input: ValidateInput): ValidateResult;
```

**Assinaturas verificadas (regex/AST leve):**
| Brief pediu | Detectar no código |
|-------------|-------------------|
| `parallax-depth` | `Parallax` ou `useScrollProgress` ou `parallax` em style |
| `animated-mesh-background` | `@keyframes` mesh ou `AnimatedMesh` ou gradient animation |
| `hero-cinematic-spotlight` | `HeroCinematicSpotlight` ou spotlight mouse pattern |
| `grain-texture-overlay` | `GrainArtisanalOverlay` ou `mix-blend-mode: overlay` noise |
| `sticky-stack` | `StickyStackNarrative` ou `position: sticky` em ≥2 sections |
| Anti: Hero+Bento default | `HeroSignature` + `BentoGrid` sem outro hero opinionated → **warn/block** |

**Teste:** fixtures App.tsx com/sem assinaturas.

#### `supabase/functions/agent-run/tools/design.ts` (NOVO)

Registrar em `run-setup.ts` ou onde tools são montadas (mesmo padrão `tools/extract.ts`):

| Tool | Modo | Handler |
|------|------|---------|
| `design_resolve` | Plan + Build | `resolveDesignPackage` → JSON |
| `design_validate` | Build | `validateDesignImplementation` |
| `design_inventory` | Ambos | `buildDesignManifestSummary` |

**Wire:** `grep registerDesignTools` → adicionar ao factory que chama `registerFsTools`, etc.

#### `supabase/functions/agent-run/observer.ts`

| Função | Mudança |
|--------|---------|
| `checkDesignSystem` L354+ | Após violações sintaxe, chamar `validateDesignImplementation` se `approvedDesign` presente |
| Falha validate | `passed: false` com feedback craft-specific |

---

### 4.5 Scripts e CI (BUILD)

#### `scripts/generate-design-manifest.mjs` (NOVO)

Input: `packages/forge-ui/src/**`  
Output: `supabase/functions/agent-run/design_manifest.generated.json`

**Extrai:**
- `compositions_opinionated` — parse `COMPOSITIONS` array de `compositions/opinionated/index.ts` (regex/AST)
- `compositions_basic` — exports de `composites/index.ts`
- `techniques` — `techniques/index.ts` + `reference` snippet length
- `dna_seeds` — id, name, category, serves_domains (sem corpo completo)
- `visual_languages` — id, name, serves
- `motion_primitives` — export names de Motion.tsx
- `phantom_banned` — diff entre antigo KNOWN_FORGE_COMPOSITES e exports reais

**CI:** adicionar em `package.json`:
```json
"design:manifest": "node scripts/generate-design-manifest.mjs",
"design:check": "node scripts/generate-design-manifest.mjs --check"
```
`--check` falha se JSON diverge do committed.

**Hook:** `precommit` ou step CI `npm run design:check`.

#### `scripts/bundle-forge-ui-seed.mjs` (EXISTENTE — não mudar lógica)

Após novas técnicas/composições: rodar seed bundle + manifest check na mesma PR.

---

### 4.6 Frontend contract (WIRE mínimo)

| Arquivo | Mudança |
|---------|---------|
| `packages/agent-contract/src/events.ts` | `DesignPlanFieldPayload` + compositions, read_paths |
| `supabase/functions/_shared/agent-contract-events.ts` | Sync (script `sync-agent-contract.mjs`) |
| `src/lib/agent-progress.ts` | Parse novos campos |
| Inspector UI | Exibir compositions + "efeitos" em prosa humana — **somente se** já existir componente; senão markdown do plan basta |

**Não tocar:** ChatPlanDock, skeleton, PlanPhaseList, loop compressão.

---

### 4.7 `packages/forge-ui` — BUILD de gaps P2

Cada técnica segue contrato em `techniques/types.ts`:

```typescript
interface Technique {
  id: string;
  name: string;
  concept: string;
  whenToUse: string;
  pairsWith: string[];
  primitives: string[];
  reference: string;  // snippet TSX
}
```

| Arquivo novo | ID | LOC estimado |
|--------------|-----|--------------|
| `techniques/smooth-scroll-lenis.ts` | smooth-scroll-lenis | ~80 (wrapper useLenis) |
| `techniques/section-tabs-visual.ts` | section-tabs-visual | ~120 |
| `techniques/process-steps-scroll.ts` | process-steps-scroll | ~100 |
| `techniques/logo-marquee-social-proof.ts` | logo-marquee-social-proof | ~60 |
| `compositions/opinionated/SectionTabsFeatureLanes.tsx` | section-tabs-feature-lanes | ~150 |
| `compositions/opinionated/ProcessStepsHowItWorks.tsx` | process-steps-how-it-works | ~140 |
| `compositions/opinionated/FAQAccordionCraft.tsx` | faq-accordion-craft | ~100 |
| `compositions/opinionated/InteractiveHeroDemo.tsx` | interactive-hero-demo | ~180 |

**Registrar em:**
- `techniques/index.ts` — export + `TECHNIQUE_BY_ID`
- `compositions/opinionated/index.ts` — `COMPOSITIONS` entry
- `composites/index.ts` — export component
- Rodar `node scripts/bundle-forge-ui-seed.mjs`
- Rodar `node scripts/generate-design-manifest.mjs`

**Testes:** vitest em `packages/forge-ui` — cada composição renderiza sem throw; manifest count atualizado.

---

## 5. Orçamento de leitura LLM (Tiered Design Retrieval)

| Tier | O que | Chars/Linhas | Quando |
|------|-------|--------------|--------|
| 0 | `buildDesignManifestSummary()` | ~6-8k chars | Sempre (system) |
| 1 | `design_resolve` output | ~1.5-2.5k chars | Plan UI / início Build |
| 2 | `fs_read` paths do pacote | ~180-350 linhas | Antes 1º patch UI |
| 3 | `design_validate` feedback | ~500 chars | Pós-patch / observer |
| 4 | DNA completo 1 arquivo | ~50-120 linhas | Só se adaptação fina |

**Total por landing:** ~250-350 linhas código + ~10k chars contexto. **Não** 7k linhas forge-ui.

**Gate duro:** `execute-helpers.ts` nova função `assertDesignReadsDone(read_paths, toolsUsed)` — se falhar, próximo turno só permite `fs_read` nos paths pendentes.

---

## 6. Fusão skill `forge-design` (conteúdo alvo)

Substitui `design-system` em `skills.ts`. Estrutura:

1. **MISSÃO** — design único por domínio; proibido default Hero+Bento
2. **Workflow obrigatório**
   - Plan UI: `design_resolve` → preencher `create_plan.design` → usuário aprova
   - Build: `fs_read` todos `read_paths` → adaptar composição (não copiar cego) → `design_validate`
3. **Manifest** — "só importe o que está em design_manifest; phantom_banned é proibido"
4. **Um exemplo** — `HeroCinematicSpotlight` adaptado para "estúdio de podcast" (não SaaS genérico)
5. **Tokens** — regras @theme (manter)
6. **A11y + motion** — manter, referenciar primitivos Motion

**react-tailwind** skill: manter separada; sem overlap de design.

---

## 7. Plano de PRs (DAG — ordem obrigatória)

```
PR-1 manifest generator + JSON committed
    ↓
PR-2 design-enforcement + preflight (verdade, sem fantasmas)
    ↓
PR-3 forge-design skill + DESIGN_GUIDE dedup + alias design-system
    ↓
PR-4 design-resolve.ts + design-resolve.test.ts
    ↓
PR-5 tools/design.ts + CREATE_PLAN schema + types + contract sync
    ↓
PR-6 plan-turn auto-resolve + run-job directive completo
    ↓
PR-7 execute gate read_paths + buildExecuteInstruction design
    ↓
PR-8 design-validate.ts + observer integration
    ↓
PR-9 agent-system-input manifest injection + feature flag
    ↓
PR-10 extract_design_dna merge no resolve (quota Plan)
    ↓
PR-11..14 forge-ui P2 techniques + compositions (1 PR por par técnica+composição)
```

### Aceite por PR

| PR | Comando verificação | Critério |
|----|---------------------|----------|
| PR-1 | `npm run design:check` | JSON committed; phantom_banned = 29 itens |
| PR-2 | `deno test design-enforcement` | ServiceGrid falha; HeroCinematic passa |
| PR-3 | `deno test agent-system-input` | Sem Hero+Bento no snapshot |
| PR-4 | `deno test design-resolve` | 5 domínios → 5 composições distintas |
| PR-5 | `deno test meta` | create_plan.design persiste |
| PR-6 | `deno test plan-turn` | UI plan sempre tem design field |
| PR-7 | `deno test execute-helpers` | Patch bloqueado sem fs_read |
| PR-8 | `deno test design-validate` | Detecta parallax quando brief pediu |
| PR-9 | Manual + test | System +8k chars com flag |
| PR-10 | integration | URL altera relevant_dnas |
| PR-11+ | `vitest forge-ui` + seed bundle | Manifest atualizado |

---

## 8. Regra antirregressão (obrigatória em toda tarefa)

**Proibido editar** componentes de UI do app FORGE:

- `src/**/*.tsx` e `src/**/*.css` (editor, chat, inspector, rotas, hooks de UI)
- `src/components/**` — sem exceção
- Composições/técnicas **já existentes** em `packages/forge-ui` — só leitura para manifest; mudanças apenas em **arquivos novos** (fase I)

**Permitido:**

- `supabase/functions/agent-run/**`
- `scripts/generate-design-manifest.mjs`, `package.json` scripts
- `packages/agent-contract/**`, `supabase/functions/_shared/agent-contract-events.ts`
- `src/lib/agent-progress.ts` (parse de eventos — não UI)
- Testes Deno/vitest dos módulos acima
- `packages/forge-ui` — **somente arquivos novos** na fase I (nunca refatorar existentes)

| Área | Arquivos | Proteção |
|------|----------|----------|
| Chat SSE unificado | `chat-turn.ts`, `plan-turn.ts` | Não editar token handlers |
| Loop build/checkpoint | `loop.ts`, `compression.ts` | Sem mudança em compressão |
| Inspector estrutura | componentes aprovados | Fora do escopo |
| Android native | `design-preflight` templates | `needsDesignPreflight` unchanged para android |
| Billing/auth/RLS | — | Zero toque |
| `forge-ui-bundle.generated.ts` | só regenerar | Nunca editar manual |

---

## 9. Critérios de sucesso (30 dias pós PR-1..9)

| ID | Critério | Medição |
|----|----------|---------|
| S1 | 5 domínios distintos não repetem HeroSignature+BentoGrid como par principal | Diff imports + validate |
| S2 | 100% builds UI com `read_paths` logados antes 1º patch | execution log meta |
| S3 | `design_validate` pass rate >80% no 1º delivery | observer telemetry |
| S4 | Zero imports de phantom_banned | manifest + tsc |
| S5 | create_plan.design preenchido em ≥90% planos UI | plan_proposed events |
| S6 | synthesize() chamado em 100% resolves | design_resolve logs |

---

## 10. O que este plano NÃO faz (escopo explícito)

- Fine-tuning de modelo
- 25 composições big-bang (11 permanecem + 4-6 novas P2)
- Design obrigatório em planos sem UI (API, scripts, migrations)
- Refatorar turnos/chat markdown
- Dependência Aceternity/Magic UI como default

---

## 11. Checklist de implementação (52 tarefas)

Legenda: `— ok feito` | `— pendente`

### Fase A — Manifest e verdade (6)

| # | Tarefa | Status |
|---|--------|--------|
| A1 | Criar `scripts/generate-design-manifest.mjs` | — ok feito |
| A2 | Gerar e commitar `design_manifest.generated.json` | — ok feito |
| A3 | Adicionar `npm run design:manifest` e `design:check` | — ok feito |
| A4 | Criar `design-manifest.ts` (load + summary + phantom) | — ok feito |
| A5 | `design-enforcement.ts` — usar manifest, banir phantoms | — ok feito |
| A6 | `design-preflight.ts` — manifest verdadeiro no contexto | — ok feito |

### Fase B — Enforcement de qualidade (3)

| # | Tarefa | Status |
|---|--------|--------|
| B7 | `countManifestImports()` substitui contagem por string | — pendente |
| B8 | Reescrever `scanProjectForLandingQuality()` | — pendente |
| B9 | Atualizar `design-enforcement.test.ts` (phantom falha) | — pendente |

### Fase C — Skill e prompt (5)

| # | Tarefa | Status |
|---|--------|--------|
| C10 | Renomear/reescrever skill → `forge-design` | — pendente |
| C11 | Alias `design-system` → `forge-design` | — pendente |
| C12 | Encurtar `DESIGN_GUIDE` em `prompts.ts` | — pendente |
| C13 | Injetar manifest em `agent-system-input.ts` + flag env | — pendente |
| C14 | Testes snapshot system prompt / skill | — pendente |

### Fase D — Resolve e tools (4)

| # | Tarefa | Status |
|---|--------|--------|
| D15 | Criar `design-resolve.ts` | — pendente |
| D16 | Criar `design-resolve.test.ts` | — pendente |
| D17 | Criar `tools/design.ts` | — pendente |
| D18 | Registrar tools no factory/deps | — pendente |

### Fase E — Contrato do plano (6)

| # | Tarefa | Status |
|---|--------|--------|
| E19 | Campo `design` no schema `CREATE_PLAN_TOOL` | — pendente |
| E20 | Estender `DesignPlanField` em `types.ts` | — pendente |
| E21 | Parser `compositions` + `read_paths` em `meta.ts` | — pendente |
| E22 | Sync `agent-contract` + `_shared/agent-contract-events` | — pendente |
| E23 | Parse em `src/lib/agent-progress.ts` | — pendente |
| E24 | Teste `meta.test.ts` | — pendente |

### Fase F — Plan → Build (7)

| # | Tarefa | Status |
|---|--------|--------|
| F25 | Auto-resolve em `plan-turn` quando pedido tem UI | — pendente |
| F26 | Teste `plan-turn` (plano UI com design) | — pendente |
| F27 | Expandir `buildDesignDirectiveBlock` em `run-job.ts` | — pendente |
| F28 | Estender `buildExecuteInstruction` em `run-context.ts` | — pendente |
| F29 | Passar `approvedDesign` no `execute.ts` | — pendente |
| F30 | Wire `approvedDesign` em `deps-factory` / `loop.ts` | — pendente |
| F31 | Teste `run-context` com bloco design | — pendente |

### Fase G — Gates e observer (7)

| # | Tarefa | Status |
|---|--------|--------|
| G32 | `assertDesignReadsDone()` em `execute-helpers.ts` | — pendente |
| G33 | Gate no `execute.ts` antes do 1º patch UI | — pendente |
| G34 | Teste `execute-helpers` (patch bloqueado) | — pendente |
| G35 | Criar `design-validate.ts` | — pendente |
| G36 | Criar `design-validate.test.ts` | — pendente |
| G37 | Integrar validate no `observer.ts` | — pendente |
| G38 | Passar `approvedDesign` para observer via deps | — pendente |

### Fase H — DNA do usuário (2)

| # | Tarefa | Status |
|---|--------|--------|
| H39 | Abrir `extract_design_dna` no Plan (quota) | — pendente |
| H40 | Merge DNA extraído no `design-resolve` | — pendente |

### Fase I — Novas peças forge-ui (12)

| # | Tarefa | Status |
|---|--------|--------|
| I41 | Técnica `smooth-scroll-lenis` | — pendente |
| I42 | Técnica `section-tabs-visual` | — pendente |
| I43 | Técnica `process-steps-scroll` | — pendente |
| I44 | Técnica `logo-marquee-social-proof` | — pendente |
| I45 | Composição `SectionTabsFeatureLanes` | — pendente |
| I46 | Composição `ProcessStepsHowItWorks` | — pendente |
| I47 | Composição `FAQAccordionCraft` | — pendente |
| I48 | Composição `InteractiveHeroDemo` | — pendente |
| I49 | Registrar exports (techniques + opinionated + composites) | — pendente |
| I50 | Vitest das 4 composições | — pendente |
| I51 | `node scripts/bundle-forge-ui-seed.mjs` | — pendente |
| I52 | `npm run design:check` pós-expansão | — pendente |

**Total:** 52 tarefas | **Concluídas:** 6 | **Pendentes:** 46

---

## Apêndice A — Lista verdadeira de exports `@forge/ui` (2026-06-24)

**Básicos (9):** HeroSignature, BentoGrid, FeatureMatrix, StatsRibbon, CTASignature, NavShell, FooterColumns, PricingTiers, TestimonialCarousel

**Opinionated (11):** HeroEditorialSplit, HeroBrutalistTypography, HeroCinematicSpotlight, StickyStackNarrative, BentoDenseShowcase, EditorialMagazineSplit, KineticHeadlineReveal, SpotlightShowcaseGrid, ParallaxProductShowcase, GlassNavFloating, GrainArtisanalOverlay

**Fantasmas a banir (29):** LogoWall, FAQAccordion, TeamGrid, MarqueeStrip, SplitFeature, MediaGallery, ContactForm, NewsletterSignup, AppScreenshot, ComparisonTable, TimelineVertical, ProcessSteps, TrustBar, CaseStudyCard, AnnouncementBar, StickyCTA, SplitHero, VideoHero, ProductShowcase, ServiceGrid, LocationMap, BookingWidget, ReviewGrid, GalleryMasonry, PressMentions, IntegrationGrid, DashboardPreview, MetricCards, OnboardingSteps

## Apêndice B — 14 DNA seeds (bootstrap)

elevenlabs-hero-split, vercel-edge-hero, apple-product-hero-cinematic, stripe-editorial-density, linear-motion-choreography, awwwards-brutalist-typography, editorial-magazine-split, bento-dense-showcase, sticky-stack-narrative, spotlight-showcase-portfolio, kinetic-headline-reveal, glassmorphism-nav-floating, grain-texture-artisanal, parallax-depth-3layer

## Apêndice C — 12 técnicas atuais

scroll-reveal, sticky-stack, parallax-depth, magnetic-interaction, kinetic-typography, spotlight-cursor, tilt-hover, count-up-metrics, infinite-marquee, animated-mesh-background, glassmorphism-layers, grain-texture-overlay

## Apêndice D — Specs P3 (ano 2)

| ID | Arquivo | Dependência | Notas |
|----|---------|-------------|-------|
| page-view-transition | `techniques/page-view-transition.ts` | React 19 ViewTransition | Flag `prefers-reduced-motion` |
| liquid-blob-background | `techniques/liquid-blob-background.ts` | CSS filter ou SVG | Mobile degrade |
| video-hero-background | `techniques/video-hero-background.ts` | `<video>` + poster | Lazy load |
| webgl-hero-light | `techniques/webgl-hero-light.ts` | three.js peer optional | Feature flag performance |

## Apêndice E — Chars medidos (baseline)

| Artefato | Chars |
|----------|-------|
| DESIGN_GUIDE | ~2.400 |
| skill design-system | ~3.500 |
| compositionCatalogSummary | 4.026 |
| designDnaCatalogSummary (14) | 7.053 |
| buildForgeAgentSystemInput plan | 12.527 |
| Manifest Tier 0 alvo | 6.000-8.000 |