// router.test.ts — Testes do ModelRouter (Fase 4.6+: plano rico estruturado)
// Deno runtime: deno test --allow-env --no-check router.test.ts
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { ModelRouter } from "./router.ts";
import type { LLMProvider } from "./types.ts";
import type { ChatParams, ChatResponse } from "./types.ts";

// ===== MOCK LLM =====
class MockLLM implements LLMProvider {
  q: (ChatResponse | Error)[];
  calls: ChatParams[] = [];
  constructor(r: (ChatResponse | Error)[] = []) {
    this.q = [...r];
  }
  queue(...r: (ChatResponse | Error)[]) {
    this.q.push(...r);
  }
  async chat(p: ChatParams): Promise<ChatResponse> {
    this.calls.push(p);
    const next = this.q.shift();
    if (!next) throw new Error("mock: no response queued");
    if (next instanceof Error) throw next;
    return next;
  }
}

function routerWith(cheap: LLMProvider): ModelRouter {
  return new ModelRouter({ ANTHROPIC_API_KEY: "sk-mock" }, { cheap, main: cheap });
}

function mockResp(content: string): ChatResponse {
  return { content, toolCalls: null };
}

Deno.test(
  "router.classify: LLM devolve plan estruturado → classification.plan populado",
  async () => {
    const llm = new MockLLM([
      mockResp(
        JSON.stringify({
          complexity: 3,
          type: "new_project",
          summary: "Vou criar um componente de Toast com 4 variantes visuais e animação de entrada",
          needsBuild: true,
          needsDeps: true,
          plan: {
            rationale:
              "Vamos começar pela estrutura do componente e os tipos pra você revisar antes da lógica de animação. Depois faço os estilos e por fim a animação — assim se algo precisar mudar, ajustamos cedo.",
            steps: [
              {
                id: "s1",
                type: "create_file",
                description:
                  "Criar src/components/Toast.tsx com props variant/message/duration e types",
                filePath: "src/components/Toast.tsx",
                estimatedCost: 0.003,
              },
              {
                id: "s2",
                type: "create_file",
                description:
                  "Criar src/components/Toast.module.css com as 4 variantes de cor (success/error/warning/info)",
                filePath: "src/components/Toast.module.css",
                estimatedCost: 0.002,
              },
              {
                id: "s3",
                type: "install_dep",
                description: "Instalar framer-motion para a animação de entrada/saída",
                estimatedCost: 0.001,
              },
              {
                id: "s4",
                type: "shell_exec",
                description: "Rodar npm run typecheck pra validar que não quebrou o build",
                estimatedCost: 0.001,
              },
            ],
          },
        }),
      ),
    ]);
    const r = routerWith(llm);
    const result = await r.classify("Crie um componente de Toast", "(vazio)");
    assertEquals(result.type, "new_project");
    assertEquals(
      result.summary,
      "Vou criar um componente de Toast com 4 variantes visuais e animação de entrada",
    );
    assertExists(result.plan, "plan deveria estar populado");
    assertEquals(result.plan!.steps.length, 4);
    assertEquals(result.plan!.steps[0].type, "create_file");
    assertEquals(result.plan!.steps[0].filePath, "src/components/Toast.tsx");
    assert(result.plan!.rationale.includes("estrutura"), "rationale deveria ser amigável");
  },
);

Deno.test(
  "router.classify: LLM sem plan → classification.plan é undefined, summary mantido",
  async () => {
    const llm = new MockLLM([
      mockResp(
        JSON.stringify({
          complexity: 2,
          type: "modify",
          summary: "Vou ajustar o botão de fechar do modal",
          needsBuild: true,
          needsDeps: false,
        }),
      ),
    ]);
    const r = routerWith(llm);
    const result = await r.classify("Ajuste o botão de fechar do modal", "(vazio)");
    assertEquals(result.type, "modify");
    assertEquals(result.summary, "Vou ajustar o botão de fechar do modal");
    assertEquals(result.plan, undefined);
  },
);

Deno.test("router.classify: JSON inválido → fallback gracioso sem plan", async () => {
  const llm = new MockLLM([mockResp("não é json")]);
  const r = routerWith(llm);
  const result = await r.classify("foo", "(vazio)");
  // cai no catch — summary vira o prompt truncado, sem plan
  assertEquals(result.summary, "foo");
  assertEquals(result.plan, undefined);
});

Deno.test("router.classify: LLM lança erro → fallback gracioso (sem plan)", async () => {
  const llm = new MockLLM([new Error("boom")]);
  const r = routerWith(llm);
  const result = await r.classify("qualquer coisa", "(vazio)");
  assertEquals(result.complexity, 3);
  assertEquals(result.type, "modify");
  assertEquals(result.plan, undefined);
});

Deno.test("router.classify: plan com steps vazio é descartado, vira undefined", async () => {
  const llm = new MockLLM([
    mockResp(
      JSON.stringify({
        complexity: 1,
        type: "other",
        summary: "Só uma pergunta rápida",
        needsBuild: false,
        needsDeps: false,
        plan: { rationale: "vazio", steps: [] },
      }),
    ),
  ]);
  const r = routerWith(llm);
  const result = await r.classify("?", "(vazio)");
  assertEquals(result.plan, undefined);
});

Deno.test(
  "router.classify: step inválido (sem description) é pulado, mas steps válidos sobrevivem",
  async () => {
    const llm = new MockLLM([
      mockResp(
        JSON.stringify({
          complexity: 2,
          type: "modify",
          summary: "Fix bug",
          needsBuild: true,
          needsDeps: false,
          plan: {
            rationale: "r",
            steps: [
              { id: "bad", type: "custom" },
              { id: "ok", type: "edit_file", description: "Consertar X", filePath: "src/X.ts" },
            ],
          },
        }),
      ),
    ]);
    const r = routerWith(llm);
    const result = await r.classify("Fix bug", "(vazio)");
    assertExists(result.plan);
    assertEquals(result.plan!.steps.length, 1);
    assertEquals(result.plan!.steps[0].id, "ok");
  },
);

Deno.test("router.classify: usa cheap model (max_tokens >= 1000)", async () => {
  const llm = new MockLLM([
    mockResp(
      JSON.stringify({
        complexity: 1,
        type: "other",
        summary: "x",
        needsBuild: false,
        needsDeps: false,
      }),
    ),
  ]);
  const r = routerWith(llm);
  await r.classify("oi", "");
  assertEquals(llm.calls.length, 1);
  const call = llm.calls[0];
  assertExists(call.max_tokens);
  assert(
    call.max_tokens >= 1000,
    `max_tokens=${call.max_tokens} deveria ser >= 1000 pra caber o plano`,
  );
});

Deno.test("router.classify: temperature baixa (0.0-0.3) para planos determinísticos", async () => {
  const llm = new MockLLM([
    mockResp(
      JSON.stringify({
        complexity: 1,
        type: "other",
        summary: "x",
        needsBuild: false,
        needsDeps: false,
      }),
    ),
  ]);
  const r = routerWith(llm);
  await r.classify("oi", "");
  const t = llm.calls[0].temperature;
  assert(
    t !== undefined && t >= 0 && t <= 0.3,
    `temperature=${t} deveria ser baixa pra planos estáveis`,
  );
});
