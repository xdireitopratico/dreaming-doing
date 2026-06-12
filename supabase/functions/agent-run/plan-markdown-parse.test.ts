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