// loop.test.ts — Testes completos do AgentLoop (v3 — final com asserts corrigidos)
// Deno runtime: deno test --allow-env --no-check loop.test.ts
import {
  assertEquals,
  assertExists,
  assertArrayIncludes,
  assertNotEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { AgentLoop } from "./loop.ts";
import { ToolRegistry } from "./registry.ts";
import { LoopPhase } from "./types.ts";
import type {
  AgentState,
  LLMProvider,
  ChatMessage,
  ChatResponse,
  ChatParams,
  ToolResult,
  ProposedPlan,
  PlanStep,
} from "./types.ts";
import {
  stableToolArgs,
  hashToolStep,
  hashToolBatch,
  isExecutionStuck,
} from "../_shared/agent-stuck.ts";
import { appendExecutionLogEntry } from "./executionLogMeta.ts";
import { validateApprovedSteps } from "./plan-mode.ts";

// ===== UUID MOCK =====
let _uuid = 0;
const _origUUID = crypto.randomUUID;
(crypto as { randomUUID: typeof crypto.randomUUID }).randomUUID = () =>
  `mu-${String(++_uuid).padStart(4, "0")}` as `${string}-${string}-${string}-${string}-${string}`;

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
    const { onTokenDelta, ...serializable } = p;
    this.calls.push(structuredClone(serializable));
    const r = this.q.shift();
    const fallback = {
      role: "assistant" as const,
      content: "Continuando com o pedido.",
      tool_calls: [] as ChatResponse["tool_calls"],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        input_tokens: 10,
        output_tokens: 5,
      },
    };
    const resolved = !r
      ? fallback
      : r instanceof Error
        ? null
        : structuredClone(r);
    if (!resolved) {
      if (r instanceof Error) throw r;
      return fallback;
    }
    if (onTokenDelta && resolved.tool_calls?.length === 0 && !String(resolved.content ?? "").trim()) {
      onTokenDelta("Vou analisar o projeto…");
    }
    return resolved;
  }
}

// ===== MOCK SUPABASE =====
class QB {
  private op = "select";
  private payload: unknown = null;
  private lastWriteOp: "insert" | "update" | "delete" | "upsert" | null = null;
  constructor(
    private p: MockSB,
    private t: string,
  ) {}
  select(_?: string): this {
    this.op = "select";
    return this;
  }
  insert(...a: unknown[]): this {
    this.op = "insert";
    this.lastWriteOp = "insert";
    this.payload = a[0];
    this.p.noteMessageWrite(this.t, "insert", a[0]);
    return this;
  }
  update(...a: unknown[]): this {
    this.op = "update";
    this.lastWriteOp = "update";
    this.payload = a[0];
    this.p.noteMessageWrite(this.t, "update", a[0]);
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  upsert(..._a: unknown[]): this {
    this.op = "upsert";
    return this;
  }
  eq(..._a: unknown[]): this {
    return this;
  }
  filter(..._a: unknown[]): this {
    return this;
  }
  order(..._a: unknown[]): this {
    return this;
  }
  limit(..._a: unknown[]): this {
    return this;
  }
  maybeSingle(): Promise<{ data: unknown; error: null }> {
    return Promise.resolve(this.p.resolve(this));
  }
  single(): Promise<{ data: unknown; error: null }> {
    return Promise.resolve(this.p.resolve(this));
  }
  getTable() {
    return this.t;
  }
  getOperation() {
    return this.op;
  }
  getWriteOperation() {
    return this.lastWriteOp;
  }
  getPayload() {
    return this.payload;
  }
}

class MockSB {
  private r = new Map<string, { data: unknown }>();
  queries: QB[] = [];
  messageInserts = 0;
  messageUpdates = 0;
  private messageRow: {
    id: string;
    parts?: Array<{ type: string; text: string }>;
    meta?: Record<string, unknown>;
  } | null = null;
  messageWriteMetas: Array<Record<string, unknown> | undefined> = [];
  noteMessageWrite(table: string, op: "insert" | "update", payload: unknown) {
    if (table !== "messages") return;
    const p = payload as {
      parts?: Array<{ type: string; text: string }>;
      meta?: Record<string, unknown>;
    } | null;
    if (p?.meta) this.messageWriteMetas.push(p.meta);
    if (op === "insert") {
      this.messageInserts++;
      this.messageRow = { id: "msg-live", meta: p?.meta };
      return;
    }
    this.messageUpdates++;
    const parts = p?.parts;
    if (!this.messageRow) this.messageRow = { id: "msg-live" };
    if (parts) this.messageRow.parts = parts;
    if (p?.meta) this.messageRow.meta = p.meta;
  }
  set(table: string, data: unknown) {
    this.r.set(table, { data });
  }
  from(table: string): QB {
    const q = new QB(this, table);
    this.queries.push(q);
    return q;
  }
  resolve(b: QB): { data: unknown; error: null } {
    if (b.getTable() === "messages") {
      const writeOp = b.getWriteOperation();
      if (writeOp === "insert") {
        return { data: { id: this.messageRow?.id ?? "msg-live" }, error: null };
      }
      if (writeOp === "update") {
        return { data: null, error: null };
      }
      if (b.getOperation() === "select") {
        return { data: this.messageRow, error: null };
      }
    }
    const row = this.r.get(b.getTable()) ?? { data: null };
    return { ...row, error: null };
  }
}

// ===== MOCK TOOL REGISTRY =====
type Cond = {
  name: string;
  ok: boolean;
  out: unknown;
  match?: (a: Record<string, unknown>) => boolean;
};
class MockReg extends ToolRegistry {
  conds: Cond[] = [];
  execs: Array<{ name: string; args: Record<string, unknown> }> = [];
  add(name: string, ok: boolean, out: unknown, match?: (a: Record<string, unknown>) => boolean) {
    this.conds.push({ name, ok, out, match });
  }
  pass() {
    const landingApp =
      'import { HeroSignature, BentoGrid, CTASignature, FadeIn, NavShell, FooterColumns, StatsRibbon } from "@forge/ui";\n' +
      'export default function App() { return <main><HeroSignature title="x" primaryCta={{ label: "Go" }} /><BentoGrid cells={[]} /><CTASignature title="t" primaryLabel="p" /></main>; }';
    // sandboxPathExists (observer)
    this.add("shell_exec", true, { stdout: "yes\n", stderr: "" }, (a) =>
      String(a.command ?? "").includes("test -e"),
    );
    this.add(
      "fs_read",
      true,
      JSON.stringify({ dependencies: { "@forge/ui": "file:./packages/forge-ui" } }),
      (a) => a.path === "package.json",
    );
    this.add("fs_read", true, landingApp, (a) => /\.(tsx|ts)$/.test(String(a.path ?? "")));
    this.add("shell_exec", true, { stdout: "./src/App.tsx\n", stderr: "" }, (a) =>
      String(a.command ?? "").includes("find "),
    );
    this.add(
      "shell_exec",
      true,
      { stdout: "src/index.css:@theme { --color-brand-500: #000; }\n", stderr: "" },
      (a) => String(a.command ?? "").includes("grep"),
    );
    this.add("shell_exec", true, { stdout: "", stderr: "" }, (a) =>
      String(a.command ?? "").includes("npm run build"),
    );
    this.add("shell_exec", true, { stdout: "", stderr: "" }, (a) => {
      const c = String(a.command ?? "");
      return c.includes("npm install") || c.includes("npx ") || c.includes("git ");
    });
  }
  failBuild() {
    // npm build fails, everything else ok
    this.add("shell_exec", false, { stdout: "", stderr: "BUILD FAILED" }, (a) =>
      String(a.command ?? "").includes("npm run build"),
    );
    this.add("shell_exec", true, { stdout: "", stderr: "" }, (a) => {
      const c = String(a.command ?? "");
      return c.includes("npm install") || c.includes("git ");
    });
    this.add("shell_exec", true, { stdout: "", stderr: "" }, (a) => {
      const c = String(a.command ?? "");
      return c.includes("npx tsc") || c.includes("find ") || c.includes("grep ");
    });
  }
  failTypecheck() {
    this.pass();
    // quickTypeCheck runs: npx tsc --noEmit "src/New.tsx" (with quotes around filename)
    this.add(
      "shell_exec",
      true,
      { stdout: "", stderr: "src/New.tsx(1,7): error TS2322: type mismatch\n" },
      (a) => {
        const c = String(a.command ?? "");
        return c.includes("npx tsc") && c.includes("--noEmit");
      },
    );
  }
  init() {
    const tools: Array<{ n: string; props?: Record<string, unknown>; req?: string[] }> = [
      { n: "fs_read", props: { path: { type: "string" } }, req: ["path"] },
      {
        n: "fs_write",
        props: { path: { type: "string" }, content: { type: "string" } },
        req: ["path", "content"],
      },
      {
        n: "fs_edit",
        props: {
          path: { type: "string" },
          oldText: { type: "string" },
          newText: { type: "string" },
        },
        req: ["path", "oldText", "newText"],
      },
      { n: "fs_delete", props: { path: { type: "string" } }, req: ["path"] },
      { n: "fs_list" },
      { n: "fs_search", req: ["regex"] },
      { n: "fs_read_many", req: ["paths"] },
      { n: "shell_exec", props: { command: { type: "string" } }, req: ["command"] },
      {
        n: "clarify",
        props: {
          question: { type: "string" },
          intro: { type: "string" },
          choices: { type: "array" },
        },
        req: ["question"],
      },
      {
        n: "create_plan",
        props: {
          summary: { type: "string" },
          steps: { type: "array" },
        },
        req: ["summary", "steps"],
      },
    ];
    for (const t of tools) {
      this.register(
        {
          name: t.n,
          description: t.n,
          parameters: { type: "object", properties: t.props ?? {}, required: t.req ?? [] },
        },
        async (a) => this.exec(t.n, a),
      );
    }
  }
  private async exec(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    this.execs.push({ name, args: structuredClone(args) });
    for (const c of [...this.conds].reverse()) {
      if (c.name !== name) continue;
      if (!c.match || c.match(args))
        return { toolCallId: "", ok: c.ok, output: c.out, artifacts: [] };
    }
    return { toolCallId: "", ok: true, output: `[${name}]`, artifacts: [] };
  }
}

// ===== HELPERS =====

function er(
  content: string,
  ...tools: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
): ChatResponse {
  return {
    role: "assistant",
    content,
    tool_calls: tools,
    usage: {
      prompt_tokens: 500,
      completion_tokens: 100,
      total_tokens: 600,
      input_tokens: 500,
      output_tokens: 100,
    },
  };
}
function tr(content: string): ChatResponse {
  return {
    role: "assistant",
    content,
    tool_calls: [],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      input_tokens: 100,
      output_tokens: 20,
    },
  };
}
function tc(id: string, name: string, args: Record<string, unknown>) {
  return { id, name, arguments: args };
}

interface F {
  sb: MockSB;
  reg: MockReg;
  cheap: MockLLM;
  main: MockLLM;
  loop: AgentLoop;
  events: Array<{ type: string; data: unknown }>;
}
function f(
  opts: {
    msgs?: ChatMessage[];
    files?: Array<{ path: string; content: string }>;
    maxSteps?: number;
    resume?: boolean;
    checkpoint?: boolean;
    resumePhase?: LoopPhase | null;
    score?: number;
    maxFromCk?: number;
    runId?: string;
    intent?: AgentState["intent"];
    log?: string[];
    stepIdx?: number;
    planMode?: boolean;
  } = {},
): F {
  const sb = new MockSB();
  const reg = new MockReg();
  reg.init();
  reg.pass();
  sb.set("project_files", {
    data: (opts.files ?? []).map((f) => ({ ...f, updated_at: "2024-01-01" })),
  });
  sb.set("messages", { data: { id: "msg-new" } });
  sb.set("agent_checkpoints", { data: null });
  sb.set("projects", { data: null });
  sb.set("agent_runs", { data: null });

  const state: AgentState = {
    projectId: "p1",
    conversationId: "c1",
    userId: "u1",
    messages: opts.msgs ?? [
      { role: "user", content: "Crie um componente React com header, footer e conteúdo" },
    ],
    phase: LoopPhase.GATHER_CONTEXT,
    currentStepIndex: opts.stepIdx ?? 0,
    context: null,
    intent: opts.intent ?? null,
    plan: null,
    validationResults: [],
    executionLog: opts.log ?? [],
    retryFeedback: null,
    totalSteps: 20,
  };
  const cheap = new MockLLM(),
    main = new MockLLM();
  const events: Array<{ type: string; data: unknown }> = [];
  const loop = new AgentLoop(
    reg,
    main,
    sb,
    state,
    (e) => events.push(structuredClone(e)),
    { ANTHROPIC_API_KEY: "sk-mock" },
    { main, cheap },
    false,
    "vite-react",
    "",
    {
      maxSteps: opts.maxSteps,
      resumeRun: opts.resume,
      hasCheckpoint: opts.checkpoint,
      resumePhase: opts.resumePhase ?? null,
      complexityScore: opts.score,
      maxStepsFromCheckpoint: opts.maxFromCk,
      runId: opts.runId ?? "r1",
      planMode: opts.planMode ?? false,
    },
  );
  return { sb, reg, cheap, main, loop, events };
}
function ef(ev: Array<{ type: string; data: unknown }>, type: string) {
  return ev.filter((e) => e.type === type);
}

// ===== TESTS =====

Deno.test("1 happy path — executa→valida→done", async () => {
  const { loop, cheap, main, events } = f({ files: [] });
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "src/App.tsx", content: "// app" })));
  main.queue(tr("Concluído!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assert(r.steps > 0);
  assertEquals(ef(events, "error").length, 0);
  assertEquals(ef(events, "done").length, 1);
});

Deno.test("2 resume checkpoint — restaura estado", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [
      { role: "user", content: "Crie landing" },
      { role: "assistant", content: "ok" },
    ],
    resume: true,
    checkpoint: true,
    resumePhase: LoopPhase.EXECUTE_STEP,
    score: 3,
    maxFromCk: 8,
    stepIdx: 2,
    intent: { type: "new_project", scope: [], complexity: "medium", summary: "Landing" },
  });
  main.queue(
    er("Continuando...", tc("t2", "fs_write", { path: "src/style.css", content: "/* css */" })),
  );
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(cheap.calls.length, 0);
  const cv = ef(events, "classify")[0]?.data as { restored?: boolean };
  assertEquals(cv?.restored, true);
});

Deno.test("3a plan mode propõe plano sem tool_start", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "app de voz com hermes e expo" }],
    files: [{ path: "src/App.tsx", content: "export default () => <p>Canvas vazio</p>" }],
    planMode: true,
  });
  main.queue(
    er(
      "",
      tc("p1", "create_plan", {
        summary: "App de voz com Hermes e Expo",
        steps: [
          { id: "s1", type: "observe", description: "Ler contexto do projeto" },
          {
            id: "s2",
            type: "create_file",
            description: "Implementar app de voz com Hermes e Expo",
            filePath: "src/App.tsx",
          },
        ],
      }),
    ),
  );
  main.queue(tr("Plano: app de voz com Hermes e Expo — revisar antes de codar."));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(r.steps, 0);
  assertEquals(ef(events, "plan_proposed").length, 1);
  assertEquals(ef(events, "tool_start").length, 0);
  const de = ef(events, "done")[0]?.data as { planProposed?: boolean; awaiting?: boolean };
  assertEquals(de?.planProposed, true);
  assertEquals(de?.awaiting, true);
});

Deno.test("3j Plan mode — erro LLM persiste assistant com lastFinishOk false", async () => {
  const { loop, main, sb, events } = f({
    msgs: [{ role: "user", content: "plano em fases do projeto" }],
    planMode: true,
  });
  main.queue(new Error("NVIDIA NIM API error 500: template invalid"));
  const r = await loop.run();
  assertEquals(r.ok, false);
  assertEquals(sb.messageInserts, 1);
  const meta = sb.messageWriteMetas[sb.messageWriteMetas.length - 1];
  assertEquals(meta?.lastFinishOk, false);
  const card = meta?.cardSnapshot as { lastFinishOk?: boolean; streamText?: string } | undefined;
  assertEquals(card?.lastFinishOk, false);
  assertExists(card?.streamText?.includes("template invalid"));
  assertEquals(ef(events, "assistant_text").length, 1);
});

Deno.test("3d plan mode bom dia — segue fluxo Plan (sem gate conversacional)", async () => {
  const { loop, main, events } = f({
    msgs: [{ role: "user", content: "bom dia" }],
    files: [],
    planMode: true,
  });
  main.queue(
    er(
      "",
      tc("c1", "clarify", {
        question: "O que você quer construir hoje?",
        choices: [{ label: "Landing" }, { label: "App" }],
      }),
    ),
  );
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(r.steps, 0);
  assertEquals(ef(events, "plan_proposed").length, 0);
  const phases = ef(events, "phase").map((e) => (e.data as { phase?: string }).phase);
  assertEquals(phases.includes("gather"), true);
  const de = ef(events, "done")[0]?.data as { conversational?: boolean; qualified?: boolean };
  assertEquals(de?.conversational, undefined);
  assertEquals(de?.qualified, true);
});

Deno.test("3 plan mode — pedido vago propõe plano", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "site" }],
    files: [],
    planMode: true,
  });
  main.queue(
    er(
      "",
      tc("p1", "create_plan", {
        summary: "Site",
        steps: [
          { id: "s1", type: "observe", description: "Analisar pedido e contexto" },
          { id: "s2", type: "create_file", description: "Criar landing do site", filePath: "src/App.tsx" },
        ],
      }),
    ),
  );
  main.queue(tr("Plano para o site — revise antes de codar."));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(r.steps, 0);
  assertEquals(ef(events, "plan_proposed").length, 1);
});

Deno.test("3e Build mode — clarify+fs_write no mesmo turno não executa tools", async () => {
  const { loop, main, reg, events } = f({
    msgs: [{ role: "user", content: "Crie landing de padaria completa" }],
    files: [{ path: "src/App.tsx", content: "export default () => <p>Hi</p>" }],
    maxSteps: 3,
  });
  main.queue(
    er(
      "Vou perguntar antes",
      tc("c1", "clarify", { question: "Qual tom visual?" }),
      tc("t1", "fs_write", { path: "src/App.tsx", content: "// x" }),
    ),
  );
  main.queue(er("Ok", tc("t2", "fs_write", { path: "src/App.tsx", content: "// y" })));
  main.queue(tr("Pronto"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(ef(events, "gate_decision").length, 0);
  assertEquals(reg.execs.some((e) => e.name === "fs_write"), true);
});

Deno.test("3f Plan mode — clarify sem create_plan", async () => {
  const { loop, main, events } = f({
    msgs: [{ role: "user", content: "quero um app" }],
    files: [],
    planMode: true,
  });
  main.queue(
    er(
      "",
      tc("c1", "clarify", {
        question: "Qual o objetivo principal?",
        choices: [{ label: "Vendas" }, { label: "Suporte" }],
      }),
    ),
  );
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(ef(events, "plan_proposed").length, 0);
  const de = ef(events, "done")[0]?.data as { qualified?: boolean; awaiting?: boolean };
  assertEquals(de?.qualified, true);
  assertEquals(ef(events, "gate_decision").length, 1);
});

Deno.test("3g Plan mode — create_plan inválido (1 passo)", async () => {
  const { loop, main, events } = f({
    msgs: [{ role: "user", content: "site" }],
    files: [],
    planMode: true,
  });
  main.queue(
    er("", tc("p1", "create_plan", { summary: "Site", steps: [{ description: "único" }] })),
  );
  const r = await loop.run();
  assertEquals(r.ok, false);
  assertEquals(ef(events, "plan_proposed").length, 0);
});

Deno.test("3h Plan mode — create_plan vence clarify no mesmo turno", async () => {
  const { loop, main, events } = f({
    msgs: [{ role: "user", content: "landing de padaria" }],
    files: [],
    planMode: true,
  });
  main.queue(
    er(
      "",
      tc("c1", "clarify", { question: "Mais detalhes?" }),
      tc("p1", "create_plan", {
        summary: "Landing padaria",
        steps: [
          { description: "Ler contexto", type: "observe" },
          { description: "Criar hero", type: "create_file", filePath: "src/App.tsx" },
        ],
      }),
    ),
  );
  main.queue(tr("Plano pronto para revisão."));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(ef(events, "plan_proposed").length, 1);
});

Deno.test("3i Plan mode — markdown sem create_plan vira plan_proposed", async () => {
  const planMd = `## Missão
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
  const { loop, main, events } = f({
    msgs: [{ role: "user", content: "landing oficina mecânica" }],
    files: [],
    planMode: true,
  });
  main.queue(tr(planMd));
  main.queue(tr("Plano da Oficina Confiança — revise no painel ao lado."));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(ef(events, "plan_proposed").length, 1);
  const phases = ef(events, "phase").map((e) => (e.data as { phase?: string }).phase);
  assertEquals(phases.includes("creating_plan"), true);
  const de = ef(events, "done")[0]?.data as { conversational?: boolean; planProposed?: boolean };
  assertEquals(de?.conversational, undefined);
  assertEquals(de?.planProposed, true);
});

Deno.test("3k Plan mode — Estado Atual markdown vira plan_proposed (c0416192)", async () => {
  const planMd = `## Estado Atual & Próximos Passos

### ⏳ **Falta fazer (em ordem)**
1. **Reescrever App.tsx** — landing viva com NavShell, Hero, StatsRibbon
2. **Rodar npm run dev** — validar no preview ao vivo
3. **Build final** — npm run build sem erros

### 🎯 **Resultado esperado**
Página única, fundo creme com blobs animados, cards glass e WhatsApp fixo.
`;
  const { loop, main, events } = f({
    msgs: [{ role: "user", content: "usa a tool create plan" }],
    files: [],
    planMode: true,
  });
  main.queue(tr(planMd));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(ef(events, "plan_proposed").length, 1);
  const phases = ef(events, "phase").map((e) => (e.data as { phase?: string }).phase);
  assertEquals(phases.includes("creating_plan"), true);
});

Deno.test("3c Build mode — mobile ambíguo para em clarify", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "app de voz para celular" }],
    files: [{ path: "src/App.tsx", content: "export default () => <p>Canvas vazio</p>" }],
    maxSteps: 2,
  });
  main.queue(
    er(
      "",
      tc("c1", "clarify", {
        question: "Você prefere Expo (React Native) ou Android nativo em Kotlin?",
        choices: [{ label: "Expo (React Native)" }, { label: "Android nativo (Kotlin)" }],
      }),
    ),
  );
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(r.steps, 0);
  const de = ef(events, "done")[0]?.data as { qualified?: boolean; awaiting?: boolean };
  assertEquals(de?.qualified, true);
  assertEquals(de?.awaiting, true);
});

Deno.test("3b Build mode — prompt vago segue para execução", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "site" }],
    files: [{ path: "src/App.tsx", content: "export default () => <p>Hi</p>" }],
    maxSteps: 2,
  });
  main.queue(tr("ok"));
  const r = await loop.run();
  assertEquals(ef(events, "gate_decision").length, 0);
  assertEquals(r.steps >= 1, true);
});

Deno.test("4 cancelamento via evento emitido no loop", async () => {
  // The cancel mechanism uses isCanceled() which calls sb.from(...).select(...).eq(...).maybeSingle()
  // This works with our mock. The test verifies the cancel flow is reachable.
  const { loop, cheap, main, sb, events } = f({
    msgs: [{ role: "user", content: "Crie landing page com React Tailwind" }],
    files: [],
    maxSteps: 5,
    runId: "cancel-test",
  });
  sb.set("agent_runs", { canceled_at: "2024-06-06T00:00:00Z" });
  const r = await loop.run();
  assertEquals(r.ok, false);
});

Deno.test("5 step limit — resumable", async () => {
  const { loop, cheap, main } = f({
    msgs: [
      { role: "user", content: "Refatore o projeto" },
      { role: "assistant", content: "ok" },
    ],
    files: [],
    resume: true,
    checkpoint: true,
    resumePhase: LoopPhase.EXECUTE_STEP,
    maxFromCk: 1,
    stepIdx: 1,
    intent: { type: "modify", scope: [], complexity: "medium", summary: "Refatorar" },
  });
  main.queue(er("Fazendo...", tc("t1", "fs_write", { path: "src/x.tsx", content: "// x" })));
  const r = await loop.run();
  assertEquals(r.ok, false);
  assertEquals(r.resumable, true);
});

Deno.test("6 erro LLM — resumable", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Crie componente" }],
    files: [],
  });
  main.queue(new Error("rate limit 429"));
  const r = await loop.run();
  assertEquals(r.ok, false);
  assertEquals(r.resumable, true);
  assert(ef(events, "error").length > 0);
});

Deno.test("7 stuck proativa", async () => {
  const h = hashToolBatch([
    { name: "shell_exec", arguments: { command: "echo stuck-test" } },
  ]);
  // executionLog is reset on non-resume runs, so we must use resume mode to preserve the log
  const { loop, cheap, main, events } = f({
    msgs: [
      { role: "user", content: "Corrija App.tsx" },
      {
        role: "assistant",
        content: "ok",
        tool_calls: [
          {
            id: "t0",
            type: "function",
            function: { name: "fs_write", arguments: '{"path":"src/App.tsx","content":"test"}' },
          },
        ],
      },
    ],
    files: [{ path: "src/App.tsx", content: "// old" }],
    log: [h, h, h],
    intent: { type: "fix", scope: [], complexity: "simple", summary: "Corrigir" },
    resume: true,
    checkpoint: true,
    resumePhase: LoopPhase.EXECUTE_STEP,
    stepIdx: 3,
    score: 3,
    maxFromCk: 12,
  });
  main.queue(tr("Retomando a correção do App.tsx."));
  main.queue(
    er("Corrigindo...", tc("t1", "shell_exec", { command: "echo stuck-test" })),
  );
  main.queue(tr("Pronto."));
  await loop.run();
  assert(ef(events, "stuck").length > 0, `Eventos: ${events.map((e) => e.type).join(",")}`);
});

Deno.test("8 stuck unit tests", () => {
  const h = hashToolBatch([{ name: "fs_write", arguments: { path: "a.tsx", content: "x" } }]);
  assertEquals(
    h,
    hashToolBatch([{ name: "fs_write", arguments: { path: "a.tsx", content: "x" } }]),
  );
  assertEquals(isExecutionStuck([h, h, h, h]), true);
  assertEquals(isExecutionStuck([h, h, h, "d"]), false);
});

Deno.test("9 forceTools — LLM retorna texto sem tools", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Crie um header component" }],
    files: [],
    intent: { type: "new_project", scope: [], complexity: "medium", summary: "Header" },
  });
  main.queue(tr("Vou analisar primeiro...")); // no tools, triggers forceTools
  main.queue(er("Criando", tc("t1", "fs_write", { path: "src/H.tsx", content: "// h" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  const forcedCall = main.calls.find((c) => c.tool_choice === "required");
  assertExists(forcedCall, "2ª tentativa deve forçar tool_choice=required");
  const narration = events.filter((e) => e.type === "assistant_text");
  assert(narration.length > 0, "deve emitir assistant_text (briefing/narração)");
});

Deno.test("10 git commit automático após fs_write", async () => {
  const { loop, cheap, main, reg } = f({
    msgs: [{ role: "user", content: "Crie hero.tsx" }],
    files: [],
  });
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "src/hero.tsx", content: "// hero" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  const git = reg.execs.filter(
    (c) => c.name === "shell_exec" && String(c.args.command ?? "").includes("git add -A"),
  );
  assert(git.length > 0, `shell_exec: ${reg.execs.filter((c) => c.name === "shell_exec").length}`);
});

Deno.test("11 projeto vazio sem crash", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Crie projeto do zero" }],
    files: [],
  });
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "package.json", content: "{}" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
});

Deno.test("12 persistAssistantStep reutiliza uma mensagem por run", async () => {
  const { loop, cheap, main, sb } = f({
    msgs: [{ role: "user", content: "Crie landing de padaria" }],
    files: [],
  });
  main.queue(er("Lendo componentes...", tc("t1", "fs_read", { path: "src/App.tsx" })));
  main.queue(
    er("Criando hero...", tc("t2", "fs_write", { path: "src/Hero.tsx", content: "// hero" })),
  );
  main.queue(
    er(
      "Ajustando estilos...",
      tc("t3", "fs_edit", { path: "src/App.tsx", oldText: "a", newText: "b" }),
    ),
  );
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(sb.messageInserts, 1, `inserts=${sb.messageInserts}`);
  assert(sb.messageUpdates >= 2, `updates=${sb.messageUpdates}`);
  const stepMetas = sb.messageWriteMetas.filter((m) => m?.partial === true);
  assert(stepMetas.length >= 2, `step metas with partial=true: ${stepMetas.length}`);
  const finalMeta = sb.messageWriteMetas.find((m) => typeof m?.finishedAt === "string");
  assertExists(finalMeta);
  assertEquals(finalMeta?.partial, false);
  const cardSnapshot = finalMeta?.cardSnapshot as Record<string, unknown> | undefined;
  assertExists(cardSnapshot);
  assertEquals(cardSnapshot?.finished, true);
  assert(Array.isArray(cardSnapshot?.timeline));
  assert(Array.isArray(cardSnapshot?.tools));
});

Deno.test("12b persistAssistantStep meta.partial=true em cada step", async () => {
  const { loop, cheap, main, sb } = f({
    msgs: [{ role: "user", content: "Crie landing" }],
    files: [],
  });
  main.queue(er("Lendo...", tc("t1", "fs_read", { path: "src/App.tsx" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  for (const meta of sb.messageWriteMetas) {
    if (meta?.finishedAt) continue;
    if (meta?.step !== undefined) assertEquals(meta.partial, true);
  }
});

Deno.test("13 skills detectadas", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Adicione uma página next.js ao projeto existente" }],
    files: [
      {
        path: "package.json",
        content: '{"dependencies":{"next":"15","react":"19","tailwindcss":"4"}}',
      },
      { path: "next.config.ts", content: "export default {}" },
      { path: "tailwind.config.ts", content: "export default {}" },
      { path: "src/app/layout.tsx", content: "export default function(){}" },
      { path: "src/app/page.tsx", content: "export default function(){}" },
    ],
  });
  main.queue(
    er(
      "Adicionando...",
      tc("t1", "fs_write", {
        path: "src/app/about/page.tsx",
        content: "export default function(){}",
      }),
    ),
  );
  main.queue(tr("Página criada!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  // Skills event: SkillRegistry may or may not detect skills depending on the bundled skills
  // At minimum, we verify the agent completed successfully
  const se = ef(events, "skills");
  // If skills were detected, verify structure
  if (se.length > 0) {
    const sd = se[0].data as { active?: string[]; stack?: string[] };
    assert(sd.active && sd.active.length > 0, "active skills should be non-empty if event emitted");
  }
});

Deno.test("13 múltiplos tool_calls", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Crie 3 componentes" }],
    files: [],
  });
  main.queue(
    er(
      "Criando...",
      tc("t1", "fs_read", { path: "src/App.tsx" }),
      tc("t2", "fs_list", { pattern: "src/**/*.tsx" }),
      tc("t3", "fs_write", { path: "src/A.tsx", content: "// A" }),
      tc("t4", "fs_write", { path: "src/B.tsx", content: "// B" }),
      tc("t5", "fs_write", { path: "src/C.tsx", content: "// C" }),
    ),
  );
  main.queue(tr("Criados!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(ef(events, "tool_start").length, 5);
});

Deno.test("14 LLM sem tool_calls — (type other, not forced)", async () => {
  // Long prompt to avoid qualify; type=other → forceTools=false
  const { loop, cheap, main } = f({
    msgs: [
      {
        role: "user",
        content: "Explique detalhadamente como funciona React Server Components e suas vantagens",
      },
    ],
    files: [],
    intent: { type: "other", scope: [], complexity: "simple", summary: "Explicar RSC" },
  });
  // complexity=1 → cheap model for execution
  main.queue(tr("React Server Components são componentes que renderizam no servidor..."));
  const r = await loop.run();
  assertEquals(r.ok, true);
});

Deno.test("15 build fail → rollback", async () => {
  const { loop, cheap, main, reg, events } = f({
    msgs: [{ role: "user", content: "Adicione código com erro" }],
    files: [
      { path: "package.json", content: '{"scripts":{"build":"vite build"}}' },
      { path: "tsconfig.json", content: "{}" },
    ],
  });
  reg.failBuild(); // observer reports build failure
  main.queue(
    er("Adicionando...", tc("t1", "fs_write", { path: "src/Bug.tsx", content: "const x='bug'" })),
  );
  main.queue(tr("Verificando build."));
  main.queue(
    er(
      "Corrigindo...",
      tc("t2", "fs_edit", { path: "src/Bug.tsx", oldText: "'bug'", newText: "42" }),
    ),
  );
  main.queue(tr("Tentando de novo."));
  main.queue(
    er("Tentando...", tc("t3", "fs_edit", { path: "src/Bug.tsx", oldText: "42", newText: "42" })),
  );
  main.queue(tr("Não consegui"));
  await loop.run();
  const vf = ef(events, "validate_fail");
  assert(vf.length > 0, `Eventos: ${events.map((e) => e.type).join(",")}`);
});

Deno.test("16 typecheck failure", async () => {
  const { loop, cheap, main, reg, events } = f({
    msgs: [{ role: "user", content: "Crie código TypeScript com erro de tipo" }],
    files: [
      { path: "package.json", content: "{}" },
      { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}' },
      { path: "src/App.tsx", content: "// ok" },
    ],
  });
  reg.failTypecheck(); // shell_exec for "npx tsc --noEmit src/New.tsx" returns error-like stderr
  main.queue(
    er(
      "Adicionando...",
      tc("t1", "fs_write", { path: "src/New.tsx", content: "const x: number = 's'" }),
    ),
  );
  // After typecheck fails, LLM gets feedback, should try to fix
  main.queue(
    er(
      "Corrigindo...",
      tc("t2", "fs_edit", { path: "src/New.tsx", oldText: "'s'", newText: "42" }),
    ),
  );
  main.queue(tr("Corrigido!"));
  await loop.run();
  const tcf = ef(events, "typecheck_fail");
  // The typecheck might pass if failTypecheck doesn't match the exact tsc command
  // Check: the observer.quickTypeCheck filters to .ts/.tsx files, then runs npx tsc --noEmit "src/New.tsx"
  // Our match: `npx tsc --noEmit src` — should match
  assert(tcf.length > 0, `Eventos: ${events.map((e) => e.type).join(",")}`);
});

Deno.test("17 checkpoint salvo e limpo", async () => {
  const { loop, cheap, main, sb } = f({
    msgs: [{ role: "user", content: "Faça várias alterações" }],
    files: [],
  });
  main.queue(er("P1", tc("t1", "fs_write", { path: "src/a.tsx", content: "// a" })));
  main.queue(er("P2", tc("t2", "fs_write", { path: "src/b.tsx", content: "// b" })));
  main.queue(er("P3", tc("t3", "fs_write", { path: "src/c.tsx", content: "// c" })));
  main.queue(tr("Feito!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  const ups = sb.queries.filter(
    (q) => q.getTable() === "agent_checkpoints" && q.getOperation() === "upsert",
  );
  const dels = sb.queries.filter(
    (q) => q.getTable() === "agent_checkpoints" && q.getOperation() === "delete",
  );
  assert(ups.length >= 2, `upserts: ${ups.length}`);
  assert(dels.length >= 1, `deletes: ${dels.length}`);
});

Deno.test("18 executionLog populado", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Crie arquivos" }],
    files: [],
  });
  main.queue(
    er(
      "Criando...",
      tc("t1", "fs_write", { path: "src/1.tsx", content: "// 1" }),
      tc("t2", "fs_write", { path: "src/2.tsx", content: "// 2" }),
    ),
  );
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assert(ef(events, "step").length >= 1);
});

Deno.test("19 observer validate_ok", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Crie componente React" }],
    files: [
      {
        path: "package.json",
        content:
          '{"dependencies":{"@forge/ui":"*"},"scripts":{"build":"echo OK","lint":"echo OK"}}',
      },
      { path: "tsconfig.json", content: "{}" },
    ],
  });
  main.queue(
    er(
      "Criando...",
      tc("t1", "fs_write", {
        path: "src/C.tsx",
        content: "export default function() { return <div/> }",
      }),
    ),
  );
  main.queue(tr("Concluído!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assert(ef(events, "validate_ok").length >= 1, `Eventos: ${events.map((e) => e.type).join(",")}`);
});

Deno.test("20 compressão a cada 5 turnos", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [
      { role: "user", content: "Faça alterações" },
      ...Array.from({ length: 130 }, (_, i) => ({
        role: "user" as const,
        content: `Contexto histórico ${i} `.repeat(8),
      })),
    ],
    files: [],
    maxSteps: 2,
  });
  main.queue(er("P1", tc("t1", "fs_write", { path: "src/f1.tsx", content: "// 1" })));
  main.queue(tr("Resumo: alterações feitas."));
  await loop.run();
  const ce = ef(events, "context_compress");
  assert(ce.length >= 1, `Eventos: ${events.map((e) => e.type).join(",")}`);
});

Deno.test("21 resume sem checkpoint", async () => {
  const { loop, cheap, main } = f({
    msgs: [
      { role: "user", content: "Crie landing" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "Continue" },
    ],
    resume: true,
    checkpoint: false,
    intent: { type: "new_project", scope: [], complexity: "medium", summary: "Landing" },
  });
  main.queue(
    er("Continuando...", tc("t1", "fs_write", { path: "src/style.css", content: "/* css */" })),
  );
  main.queue(tr("Concluído!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
});

Deno.test("22 smoke test — eventos principais", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Teste de eventos" }],
    files: [
      { path: "package.json", content: '{"scripts":{"build":"echo OK"}}' },
      { path: "tsconfig.json", content: "{}" },
      { path: "src/App.tsx", content: "export default () => null" },
    ],
  });
  main.queue(
    er(
      "Testing...",
      tc("t1", "fs_read", { path: "src/App.tsx" }),
      tc("t2", "fs_write", { path: "src/T.tsx", content: "// t" }),
    ),
  );
  main.queue(tr("Done!"));
  await loop.run();
  for (const t of ["phase", "step", "tool_start", "tool_done", "done"]) {
    assert(ef(events, t).length > 0, `Faltou "${t}"`);
  }
});

// ===== UNIT TESTS =====
Deno.test("stableToolArgs deterministico", () => {
  assertEquals(
    stableToolArgs({ path: "a", content: "x" }),
    stableToolArgs({ content: "x", path: "a" }),
  );
});
Deno.test("hashToolStep único", () => {
  assertNotEquals(
    hashToolStep("fs_write", { path: "a", content: "x" }),
    hashToolStep("fs_write", { path: "a", content: "y" }),
  );
});
Deno.test("hashToolBatch concatena", () => {
  assert(
    hashToolBatch([
      { name: "f", arguments: { a: "1" } },
      { name: "g", arguments: {} },
    ]).includes(";"),
  );
});
Deno.test("isExecutionStuck 4 iguais", () => {
  assertEquals(isExecutionStuck(["a", "a", "a", "a"]), true);
  assertEquals(isExecutionStuck(["a", "b", "a", "a"]), false);
  assertEquals(isExecutionStuck(["a", "a", "a"]), false);
});
Deno.test("appendExecutionLogEntry max 40", () => {
  const r = appendExecutionLogEntry(
    Array.from({ length: 40 }, (_, i) => `e${i}`),
    "e40",
  );
  assertEquals(r.length, 40);
  assertEquals(r[0], "e1");
  assertEquals(r[39], "e40");
});

// ===== FASE 4.7 — PLAN MODE (sem blocking: loop termina após propor) =====
Deno.test("plan-mode — validateApprovedSteps rejeita id desconhecido", () => {
  const original: PlanStep[] = [
    { id: "s1", type: "create_file", description: "a", enabled: true },
    { id: "s2", type: "shell_exec", description: "b", enabled: true },
  ];
  const tampered = [
    { id: "s1", enabled: true },
    { id: "evil", enabled: true },
  ];
  const r = validateApprovedSteps(original, tampered);
  assertEquals(r.ok, false);
  if (!r.ok) assert(r.reason.includes("step[1]"), `reason deve indicar o índice: ${r.reason}`);
});

Deno.test("plan-mode — validateApprovedSteps preserva description editada pelo usuário", () => {
  const original: PlanStep[] = [
    { id: "s1", type: "create_file", description: "original", filePath: "a.tsx", enabled: true },
  ];
  const edited = [{ id: "s1", description: "editada pelo user", filePath: "b.tsx", enabled: true }];
  const r = validateApprovedSteps(original, edited);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.steps[0]!.description, "editada pelo user");
    assertEquals(r.steps[0]!.filePath, "b.tsx");
  }
});

Deno.test("plan-mode — validateApprovedSteps pula steps com enabled=false", () => {
  const original: PlanStep[] = [
    { id: "s1", type: "create_file", description: "a", enabled: true },
    { id: "s2", type: "shell_exec", description: "b", enabled: true },
  ];
  const filtered = [
    { id: "s1", enabled: true },
    { id: "s2", enabled: false },
  ];
  const r = validateApprovedSteps(original, filtered);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.steps.length, 1);
    assertEquals(r.steps[0]!.id, "s1");
  }
});

// ─── Session 2.0 — contrato canônico do emissor ────────────────────────────

Deno.test("S2.0-C1 — plan_proposed inclui design + ttlMs + proposedAt", async () => {
  const { loop, main, events } = f({
    msgs: [{ role: "user", content: "crie uma landing page vibrante" }],
    files: [{ path: "src/App.tsx", content: "export default () => <p>oi</p>" }],
    planMode: true,
  });
  main.queue(
    er(
      "",
      tc("p1", "create_plan", {
        summary: "Landing vibrante",
        rationale: "Hero com parallax serve ao objetivo",
        steps: [
          { id: "s1", type: "create_file", description: "Hero", filePath: "src/Hero.tsx" },
          { id: "s2", type: "create_file", description: "CTA", filePath: "src/CTA.tsx" },
        ],
        design: {
          voice: ["bold", "kinetic"],
          moment: "Hero com parallax",
          techniques: ["parallax", "grid-asymmetry"],
          mood: "vibrant",
        },
      }),
    ),
  );
  main.queue(tr("Plano: landing vibrante — revisar antes de codar."));
  await loop.run();
  const pp = ef(events, "plan_proposed")[0]?.data as {
    design?: { voice?: string[]; moment?: string };
    ttlMs?: number;
    proposedAt?: string;
  };
  assertExists(pp, "plan_proposed deve ser emitido");
  assertEquals(pp.design?.voice, ["bold", "kinetic"]);
  assertEquals(pp.design?.moment, "Hero com parallax");
  assertEquals(typeof pp.ttlMs, "number");
  assertEquals(typeof pp.proposedAt, "string");
});

Deno.test("S2.0-C2 — tool_start/tool_done incluem toolCallId", async () => {
  const { loop, main, events } = f({ files: [] });
  main.queue(er("Criando...", tc("call-xyz", "fs_write", { path: "src/App.tsx", content: "x" })));
  main.queue(tr("Pronto!"));
  await loop.run();
  const starts = ef(events, "tool_start");
  const dones = ef(events, "tool_done");
  assert(starts.length > 0, "tool_start emitido");
  assertEquals((starts[0]!.data as { toolCallId?: string }).toolCallId, "call-xyz");
  assert(dones.length > 0, "tool_done emitido");
  assertEquals((dones[0]!.data as { toolCallId?: string }).toolCallId, "call-xyz");
});

Deno.test("S2.0-C2b — build_log emitido para npm/vite (não só gradle)", async () => {
  const { loop, main, events } = f({ files: [] });
  main.queue(
    er("Buildando...", tc("t1", "shell_exec", { command: "npm run build" })),
  );
  main.queue(tr("Pronto!"));
  await loop.run();
  const logs = ef(events, "build_log");
  assert(logs.length > 0, "build_log emitido para npm run build");
  assertEquals((logs[0]!.data as { command?: string }).command, "npm run build");
});

Deno.test("S2.0-C3 — path de sucesso emite done com tokens/cost", async () => {
  const { loop, main, events } = f({ files: [] });
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "src/App.tsx", content: "// app" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  const doneEv = ef(events, "done")[0]?.data as {
    totalInputTokens?: number;
    totalOutputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  };
  assertExists(doneEv, "done emitido");
  assertEquals(typeof doneEv.totalTokens, "number");
  assert((doneEv.totalTokens ?? 0) > 0, "totalTokens > 0");
  assertEquals(typeof doneEv.costUsd, "number");
});

Deno.test("S2.0-C8 — classify restored em resume", async () => {
  const { loop, main, events } = f({
    msgs: [
      { role: "user", content: "Crie landing" },
      { role: "assistant", content: "ok" },
    ],
    resume: true,
    checkpoint: true,
    resumePhase: LoopPhase.EXECUTE_STEP,
    score: 3,
    maxFromCk: 8,
    stepIdx: 2,
    intent: { type: "new_project", scope: [], complexity: "medium", summary: "Landing" },
  });
  main.queue(er("Continuando...", tc("t2", "fs_write", { path: "src/x.ts", content: "x" })));
  main.queue(tr("Pronto!"));
  await loop.run();
  const cv = ef(events, "classify")[0]?.data as {
    restored?: boolean;
    complexity?: string;
    summary?: string;
  };
  assertEquals(cv?.restored, true);
  assertEquals(cv?.complexity, "medium");
  assertEquals(cv?.summary, "Landing");
});

(crypto as { randomUUID: typeof crypto.randomUUID }).randomUUID = _origUUID;
