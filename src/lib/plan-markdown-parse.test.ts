import { describe, expect, it } from "vitest";
import { isPlanShapedMarkdown, parsePlanFromMarkdown } from "@/lib/plan-markdown-parse";

const OFICINA_CONFIANCA = `## Missão
Landing da Oficina Confiança — mecânica de confiança com prova social local.

## Objetivo
Primeira versão que converte visitantes em agendamentos de revisão.

## Abordagem
Hero de confiança + serviços + depoimentos de clientes da região.

## Premissas
- Stack Vite/React do projeto.
- Tom industrial quente (âmbar), não template SaaS genérico.

## Fases
### Fase 1 — Confiança e serviços
Destacar credenciais e serviços principais da oficina.

- [ ] Hero com CTA de agendamento
- [ ] Grid de serviços (revisão, freios, suspensão)
- [ ] Faixa de prova social (anos de mercado, avaliações)

### Fase 2 — Conversão
Fechar com depoimentos e contato.

- [ ] Carrossel de depoimentos de clientes
- [ ] Bloco de localização e horário
- [ ] CTA final de WhatsApp

## Fora do escopo
- Agendamento online integrado
- Alterar auth/billing
`;

describe("plan-markdown-parse", () => {
  it("detecta markdown de plano Oficina Confiança", () => {
    expect(isPlanShapedMarkdown(OFICINA_CONFIANCA)).toBe(true);
  });

  it("parseia passos e missão do fixture Oficina Confiança", () => {
    const parsed = parsePlanFromMarkdown(OFICINA_CONFIANCA);
    expect(parsed).not.toBeNull();
    expect(parsed!.summary).toContain("Oficina Confiança");
    expect(parsed!.mission).toContain("Oficina Confiança");
    expect(parsed!.steps.length).toBeGreaterThanOrEqual(5);
    expect(parsed!.steps[0]?.description).toContain("Hero");
  });

  it("rejeita conversa casual", () => {
    expect(isPlanShapedMarkdown("Bom dia! Como posso ajudar?")).toBe(false);
  });

  it("detecta markdown informal Estado Atual (c0416192)", () => {
    const ESTADO_ATUAL = `## Estado Atual & Próximos Passos

### ⏳ **Falta fazer (em ordem)**
1. **Reescrever App.tsx** — landing viva com NavShell e Hero
2. **Rodar npm run dev** — validar no preview ao vivo
3. **Build final** — npm run build sem erros

### 🎯 **Resultado esperado**
Página única com motion escalonada e WhatsApp fixo no canto da tela.
`;
    expect(isPlanShapedMarkdown(ESTADO_ATUAL)).toBe(true);
    const parsed = parsePlanFromMarkdown(ESTADO_ATUAL);
    expect(parsed?.steps.length).toBe(3);
    expect(parsed?.summary).toContain("Estado Atual");
  });
});