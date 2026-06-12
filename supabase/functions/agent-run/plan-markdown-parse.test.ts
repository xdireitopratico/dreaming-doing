import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPlanShapedMarkdown,
  parsePlanFromMarkdown,
  planToolArgsFromMarkdown,
} from "./plan-markdown-parse.ts";
import { proposedPlanFromToolArgs } from "./tools/meta.ts";

const OFICINA_CONFIANCA = `## Missão
Landing da Oficina Confiança — mecânica de confiança com prova social local.

## Objetivo
Primeira versão que converte visitantes em agendamentos de revisão.

## Abordagem
Hero de confiança + serviços + depoimentos de clientes da região.

## Premissas
- Stack Vite/React do projeto.

## Fases
### Fase 1 — Confiança
- [ ] Hero com CTA de agendamento
- [ ] Grid de serviços (revisão, freios, suspensão)

### Fase 2 — Conversão
- [ ] Carrossel de depoimentos
- [ ] CTA final de WhatsApp

## Fora do escopo
- Agendamento online integrado
`;

Deno.test("plan-markdown-parse — Oficina Confiança", () => {
  assertEquals(isPlanShapedMarkdown(OFICINA_CONFIANCA), true);
  const parsed = parsePlanFromMarkdown(OFICINA_CONFIANCA);
  assertEquals(parsed?.summary.includes("Oficina Confiança"), true);
  assertEquals((parsed?.steps.length ?? 0) >= 4, true);
});

Deno.test("plan-markdown-parse — vira ProposedPlan via meta", () => {
  const args = planToolArgsFromMarkdown(OFICINA_CONFIANCA);
  const plan = args ? proposedPlanFromToolArgs(args) : null;
  assertEquals(plan !== null, true);
  assertEquals((plan?.steps.length ?? 0) >= 4, true);
});

/** Fixture derivado do run c0416192 — ## Estado Atual sem ## Missão. */
const ESTADO_ATUAL_C0416192 = `## Estado Atual & Próximos Passos

### ✅ **Já feito**
| Item | Status |
|------|--------|
| Tokens light | Paleta creme/petróleo/âmbar |
| Build config | Vite + Tailwind v4 + @forge/ui |

### ⏳ **Falta fazer (em ordem)**
1. **Reescrever App.tsx** — landing viva com NavShell, Hero, StatsRibbon, FeatureMatrix
2. **Rodar npm run dev** — validar no preview ao vivo
3. **Build final** — npm run build sem erros

### 🎯 **Resultado esperado**
Página única, fundo creme com blobs animados, cards glass, motion escalonada, WhatsApp fixo.
`;

const DOCUMENT_ENTREGAS = `## Princípio (sua regra)
Hero de confiança primeiro.

## Estado atual (o que está errado)
- Só scaffold existe no projeto.

## Entregas
- Criar hero com CTA de agendamento
- Grid de serviços principais
- Carrossel de depoimentos

## Fora do escopo
- Auth integrada
`;

Deno.test("plan-markdown-parse — Estado Atual informal (c0416192)", () => {
  assertEquals(isPlanShapedMarkdown(ESTADO_ATUAL_C0416192), true);
  const parsed = parsePlanFromMarkdown(ESTADO_ATUAL_C0416192);
  assertEquals(parsed?.summary.includes("Estado Atual"), true);
  assertEquals((parsed?.steps.length ?? 0), 3);
  assertEquals(parsed?.steps[0]?.description.includes("Reescrever"), true);
});

Deno.test("plan-markdown-parse — documento Entregas/Estado atual", () => {
  assertEquals(isPlanShapedMarkdown(DOCUMENT_ENTREGAS), true);
  const parsed = parsePlanFromMarkdown(DOCUMENT_ENTREGAS);
  assertEquals((parsed?.steps.length ?? 0), 3);
  const args = planToolArgsFromMarkdown(DOCUMENT_ENTREGAS);
  assertEquals(args ? proposedPlanFromToolArgs(args) !== null : false, true);
});