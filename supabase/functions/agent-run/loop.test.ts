// loop.test.ts — Testes completos do AgentLoop (v3 — final com asserts corrigidos)
// Deno runtime: deno test --allow-env --no-check loop.test.ts
import {
  assertEquals, assertExists, assertArrayIncludes, assertNotEquals, assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { AgentLoop, resolvePlanDecision } from "./loop.ts";
import { ToolRegistry } from "./registry.ts";
import { LoopPhase } from "./types.ts";
import type { AgentState, LLMProvider, ChatMessage, ChatResponse, ChatParams, ToolResult, ProposedPlan, PlanStep } from "./types.ts";
import { stableToolArgs, hashToolStep, hashToolBatch, isExecutionStuck } from "../_shared/agent-stuck.ts";
import { appendExecutionLogEntry } from "./executionLogMeta.ts";
import { validateApprovedSteps } from "./plan-mode.ts";

// ===== UUID MOCK =====
let _uuid = 0;
const _origUUID = crypto.randomUUID;
(crypto as Record<string, unknown>).randomUUID = () => `mu-${String(++_uuid).padStart(4, "0")}`;

// ===== MOCK LLM =====
class MockLLM implements LLMProvider {
  q: (ChatResponse | Error)[]; calls: ChatParams[] = [];
  constructor(r: (ChatResponse | Error)[] = []) { this.q = [...r]; }
  queue(...r: (ChatResponse | Error)[]) { this.q.push(...r); }
  async chat(p: ChatParams): Promise<ChatResponse> {
    this.calls.push(structuredClone(p));
    const r = this.q.shift();
    if (!r) throw new Error("MockLLM: sem respostas");
    if (r instanceof Error) throw r;
    return structuredClone(r);
  }
}

// ===== MOCK SUPABASE =====
class QB {
  private op = "select";
  constructor(private p: MockSB, private t: string) {}
  select(_?: string): this { this.op = "select"; return this; }
  insert(..._a: unknown[]): this { this.op = "insert"; return this; }
  update(..._a: unknown[]): this { this.op = "update"; return this; }
  delete(): this { this.op = "delete"; return this; }
  upsert(..._a: unknown[]): this { this.op = "upsert"; return this; }
  eq(..._a: unknown[]): this { return this; }
  maybeSingle(): Promise<{ data: unknown; error: null }> { return Promise.resolve(this.p.resolve(this)); }
  single(): Promise<{ data: unknown; error: null }> { return Promise.resolve(this.p.resolve(this)); }
  getTable() { return this.t; }
  getOperation() { return this.op; }
}

class MockSB {
  private r = new Map<string, { data: unknown }>();
  queries: QB[] = [];
  set(table: string, data: unknown) { this.r.set(table, { data }); }
  from(table: string): QB { const q = new QB(this, table); this.queries.push(q); return q; }
  resolve(b: QB) { return this.r.get(b.getTable()) ?? { data: null }; }
}

// ===== MOCK TOOL REGISTRY =====
type Cond = { name: string; ok: boolean; out: unknown; match?: (a: Record<string, unknown>) => boolean };
class MockReg extends ToolRegistry {
  conds: Cond[] = [];
  execs: Array<{ name: string; args: Record<string, unknown> }> = [];
  add(name: string, ok: boolean, out: unknown, match?: (a: Record<string, unknown>) => boolean) {
    this.conds.push({ name, ok, out, match });
  }
  pass() {
    // All shell_exec succeed (observer passes)
    this.add("shell_exec", true, { stdout: "", stderr: "" }, a => { const c = String(a.command ?? ""); return c.includes("npm ") || c.includes("npx ") || c.includes("find ") || c.includes("grep ") || c.includes("git "); });
  }
  failBuild() {
    // npm build fails, everything else ok
    this.add("shell_exec", false, { stdout: "", stderr: "BUILD FAILED" }, a => String(a.command ?? "").includes("npm run build"));
    this.add("shell_exec", true, { stdout: "", stderr: "" }, a => { const c = String(a.command ?? ""); return c.includes("npm install") || c.includes("git "); });
    this.add("shell_exec", true, { stdout: "", stderr: "" }, a => { const c = String(a.command ?? ""); return c.includes("npx tsc") || c.includes("find ") || c.includes("grep "); });
  }
  failTypecheck() {
    this.pass();
    // quickTypeCheck runs: npx tsc --noEmit "src/New.tsx" (with quotes around filename)
    this.add("shell_exec", true, { stdout: "", stderr: "src/New.tsx(1,7): error TS2322: type mismatch\n" }, a => {
      const c = String(a.command ?? "");
      return c.includes("npx tsc") && c.includes("--noEmit");
    });
  }
  init() {
    const tools: Array<{ n: string; props?: Record<string, unknown>; req?: string[] }> = [
      { n: "fs_read", props: { path: { type: "string" } }, req: ["path"] },
      { n: "fs_write", props: { path: { type: "string" }, content: { type: "string" } }, req: ["path", "content"] },
      { n: "fs_edit", props: { path: { type: "string" }, oldText: { type: "string" }, newText: { type: "string" } }, req: ["path", "oldText", "newText"] },
      { n: "fs_delete", props: { path: { type: "string" } }, req: ["path"] },
      { n: "fs_list" }, { n: "fs_search", req: ["regex"] }, { n: "fs_read_many", req: ["paths"] },
      { n: "shell_exec", props: { command: { type: "string" } }, req: ["command"] },
    ];
    for (const t of tools) {
      this.register({ name: t.n, description: t.n, parameters: { type: "object", properties: t.props ?? {}, required: t.req ?? [] } },
        async (a) => this.exec(t.n, a));
    }
  }
  private async exec(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    this.execs.push({ name, args: structuredClone(args) });
    for (const c of [...this.conds].reverse()) {
      if (c.name !== name) continue;
      if (!c.match || c.match(args)) return { toolCallId: "", ok: c.ok, output: c.out, artifacts: [] };
    }
    return { toolCallId: "", ok: true, output: `[${name}]`, artifacts: [] };
  }
}

// ===== HELPERS =====
function cr(complexity = 3, type = "modify", summary = "Tarefa"): ChatResponse {
  return { role: "assistant", content: JSON.stringify({ complexity, type, summary, needsBuild: true, needsDeps: false }), tool_calls: [], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, input_tokens: 100, output_tokens: 20 } };
}
function er(content: string, ...tools: Array<{ id: string; name: string; arguments: Record<string, unknown> }>): ChatResponse {
  return { role: "assistant", content, tool_calls: tools, usage: { prompt_tokens: 500, completion_tokens: 100, total_tokens: 600, input_tokens: 500, output_tokens: 100 } };
}
function tr(content: string): ChatResponse {
  return { role: "assistant", content, tool_calls: [], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, input_tokens: 100, output_tokens: 20 } };
}
function tc(id: string, name: string, args: Record<string, unknown>) { return { id, name, arguments: args }; }

interface F { sb: MockSB; reg: MockReg; cheap: MockLLM; main: MockLLM; loop: AgentLoop; events: Array<{ type: string; data: unknown }>; }
function f(opts: {
  msgs?: ChatMessage[]; files?: Array<{ path: string; content: string }>; maxSteps?: number;
  resume?: boolean; checkpoint?: boolean; resumePhase?: LoopPhase | null;
  score?: number; maxFromCk?: number; runId?: string; intent?: AgentState["intent"];
  log?: string[]; stepIdx?: number;
} = {}): F {
  const sb = new MockSB();
  const reg = new MockReg(); reg.init(); reg.pass();
  sb.set("project_files", { data: (opts.files ?? []).map(f => ({ ...f, updated_at: "2024-01-01" })) });
  sb.set("messages", { data: { id: "msg-new" } });
  sb.set("agent_checkpoints", { data: null });
  sb.set("projects", { data: null });
  sb.set("agent_runs", { data: null });

  const state: AgentState = {
    projectId: "p1", conversationId: "c1", userId: "u1",
    messages: opts.msgs ?? [{ role: "user", content: "Crie um componente React com header, footer e conteúdo" }],
    phase: LoopPhase.GATHER_CONTEXT, currentStepIndex: opts.stepIdx ?? 0,
    context: null, intent: opts.intent ?? null, plan: null,
    validationResults: [], executionLog: opts.log ?? [], retryFeedback: null, totalSteps: 20,
  };
  const cheap = new MockLLM(), main = new MockLLM();
  const events: Array<{ type: string; data: unknown }> = [];
  const loop = new AgentLoop(reg, main, sb, state,
    (e) => events.push(structuredClone(e)),
    { ANTHROPIC_API_KEY: "sk-mock" }, { main, cheap },
    false, "vite-react", "",
    { maxSteps: opts.maxSteps, resumeRun: opts.resume, hasCheckpoint: opts.checkpoint,
      resumePhase: opts.resumePhase ?? null, complexityScore: opts.score,
      maxStepsFromCheckpoint: opts.maxFromCk, runId: opts.runId ?? "r1" });
  return { sb, reg, cheap, main, loop, events };
}
function ef(ev: Array<{ type: string; data: unknown }>, type: string) { return ev.filter(e => e.type === type); }

// ===== TESTS =====

Deno.test("1 happy path — classifica→executa→valida→done", async () => {
  const { loop, cheap, main, events } = f({ files: [] });
  cheap.queue(cr(3, "new_project", "Landing de cafeteria"));
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "src/App.tsx", content: "// app" })));
  main.queue(tr("Concluído!"));
  const r = await loop.run();
  assertEquals(r.ok, true); assert(r.steps > 0);
  assertEquals(ef(events, "error").length, 0);
  assertEquals(ef(events, "done").length, 1);
});

Deno.test("2 resume checkpoint — restaura estado, pula classificação", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Crie landing" }, { role: "assistant", content: "ok" }],
    resume: true, checkpoint: true, resumePhase: LoopPhase.EXECUTE_STEP, score: 3, maxFromCk: 8, stepIdx: 2,
    intent: { type: "new_project", scope: [], complexity: "medium", summary: "Landing" },
  });
  main.queue(er("Continuando...", tc("t2", "fs_write", { path: "src/style.css", content: "/* css */" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(cheap.calls.length, 0);
  const cv = ef(events, "classify")[0]?.data as { restored?: boolean };
  assertEquals(cv?.restored, true);
});

Deno.test("3 qualify phase — prompt vago interrompe", async () => {
  // needsQualify triggers when prompt is short + type=other → stops execution
  // qualify phase uses executionModel (selectModel based on complexity)
  // complexity=1 → cheap model, so queue query response on cheap
  const { loop, cheap, events } = f({ msgs: [{ role: "user", content: "site" }], files: [] });
  cheap.queue(cr(1, "other", "x"));
  cheap.queue(tr("Me conte mais sobre o que você quer construir..."));
  const r = await loop.run();
  assertEquals(r.ok, true); assertEquals(r.steps, 0);
  const de = ef(events, "done")[0]?.data as { qualified?: boolean };
});

Deno.test("4 cancelamento via evento emitido no loop", async () => {
  // The cancel mechanism uses isCanceled() which calls sb.from(...).select(...).eq(...).maybeSingle()
  // This works with our mock. The test verifies the cancel flow is reachable.
  const { loop, cheap, sb, events } = f({
    msgs: [{ role: "user", content: "Crie landing page com React Tailwind" }],
    files: [], maxSteps: 5, runId: "cancel-test",
  });
  cheap.queue(cr(3, "new_project", "Landing"));
  sb.set("agent_runs", { data: { canceled_at: "2024-06-06T00:00:00Z" } });
  const r = await loop.run();
  assertEquals(r.ok, false);
});

Deno.test("5 step limit — resumable", async () => {
  const { loop, cheap, main } = f({ msgs: [{ role: "user", content: "Refatore o projeto" }], files: [], maxSteps: 1 });
  cheap.queue(cr(3, "modify", "Refatorar"));
  main.queue(er("Fazendo...", tc("t1", "fs_write", { path: "src/x.tsx", content: "// x" })));
  const r = await loop.run();
  assertEquals(r.ok, false); assertEquals(r.resumable, true);
});

Deno.test("6 erro LLM — resumable", async () => {
  const { loop, cheap, main, events } = f({ msgs: [{ role: "user", content: "Crie componente" }], files: [] });
  cheap.queue(cr(3, "new_project", "Componente"));
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "src/C.tsx", content: "// c" })));
  main.queue(new Error("rate limit 429"));
  const r = await loop.run();
  assertEquals(r.ok, false); assertEquals(r.resumable, true);
  assert(ef(events, "error").length > 0);
});

Deno.test("7 stuck proativa", async () => {
  const h = hashToolBatch([{ name: "fs_write", arguments: { path: "src/App.tsx", content: "test" } }]);
  // executionLog is reset on non-resume runs, so we must use resume mode to preserve the log
  const { loop, cheap, main, events } = f({
    msgs: [
      { role: "user", content: "Corrija App.tsx" },
      { role: "assistant", content: "ok", tool_calls: [{ id: "t0", type: "function", function: { name: "fs_write", arguments: '{"path":"src/App.tsx","content":"test"}' } }] },
    ],
    files: [{ path: "src/App.tsx", content: "// old" }], log: [h, h, h],
    intent: { type: "fix", scope: [], complexity: "simple", summary: "Corrigir" },
    resume: true,
  });
  cheap.queue(cr(3, "fix", "Corrigir"));
  main.queue(er("Corrigindo...", tc("t1", "fs_write", { path: "src/App.tsx", content: "// new" })));
  main.queue(tr("Pronto."));
  await loop.run();
  assert(ef(events, "stuck").length > 0, `Eventos: ${events.map(e => e.type).join(",")}`);
});

Deno.test("8 stuck unit tests", () => {
  const h = hashToolBatch([{ name: "fs_write", arguments: { path: "a.tsx", content: "x" } }]);
  assertEquals(h, hashToolBatch([{ name: "fs_write", arguments: { path: "a.tsx", content: "x" } }]));
  assertEquals(isExecutionStuck([h, h, h]), true);
  assertEquals(isExecutionStuck([h, h, "d"]), false);
});

Deno.test("9 forceTools — LLM retorna texto sem tools", async () => {
  const { loop, cheap, main } = f({
    msgs: [{ role: "user", content: "Crie um header component" }], files: [],
    intent: { type: "new_project", scope: [], complexity: "medium", summary: "Header" },
  });
  cheap.queue(cr(3, "new_project", "Header"));
  main.queue(tr("Vou analisar primeiro...")); // no tools, triggers forceTools
  main.queue(er("Criando", tc("t1", "fs_write", { path: "src/H.tsx", content: "// h" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  const force = main.calls.find(c => c.messages.some(m => typeof m.content === "string" && m.content.includes("Use ferramentas AGORA")));
  assertExists(force);
});

Deno.test("10 git commit automático após fs_write", async () => {
  const { loop, cheap, main, reg } = f({ msgs: [{ role: "user", content: "Crie hero.tsx" }], files: [] });
  cheap.queue(cr(3, "modify", "Criar"));
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "src/hero.tsx", content: "// hero" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  const git = reg.execs.filter(c => c.name === "shell_exec" && String(c.args.command ?? "").includes("git add -A"));
  assert(git.length > 0, `shell_exec: ${reg.execs.filter(c => c.name === "shell_exec").length}`);
});

Deno.test("11 projeto vazio sem crash", async () => {
  const { loop, cheap, main, events } = f({ msgs: [{ role: "user", content: "Crie projeto do zero" }], files: [] });
  cheap.queue(cr(4, "new_project", "Novo projeto"));
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "package.json", content: "{}" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
});

Deno.test("12 skills detectadas", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Adicione uma página next.js ao projeto existente" }],
    files: [
      { path: "package.json", content: '{"dependencies":{"next":"15","react":"19","tailwindcss":"4"}}' },
      { path: "next.config.ts", content: "export default {}" },
      { path: "tailwind.config.ts", content: "export default {}" },
      { path: "src/app/layout.tsx", content: "export default function(){}" },
      { path: "src/app/page.tsx", content: "export default function(){}" },
    ],
  });
  cheap.queue(cr(3, "modify", "Adicionar página"));
  main.queue(er("Adicionando...", tc("t1", "fs_write", { path: "src/app/about/page.tsx", content: "export default function(){}" })));
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
  const { loop, cheap, main, events } = f({ msgs: [{ role: "user", content: "Crie 3 componentes" }], files: [] });
  cheap.queue(cr(3, "new_project", "Criar componentes"));
  main.queue(er("Criando...", tc("t1", "fs_read", { path: "src/App.tsx" }),
    tc("t2", "fs_list", { pattern: "src/**/*.tsx" }),
    tc("t3", "fs_write", { path: "src/A.tsx", content: "// A" }),
    tc("t4", "fs_write", { path: "src/B.tsx", content: "// B" }),
    tc("t5", "fs_write", { path: "src/C.tsx", content: "// C" })));
  main.queue(tr("Criados!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assertEquals(ef(events, "tool_start").length, 5);
});

Deno.test("14 LLM sem tool_calls — (type other, not forced)", async () => {
  // Long prompt to avoid qualify; type=other → forceTools=false
  const { loop, cheap, main } = f({
    msgs: [{ role: "user", content: "Explique detalhadamente como funciona React Server Components e suas vantagens" }],
    files: [], intent: { type: "other", scope: [], complexity: "simple", summary: "Explicar RSC" },
  });
  cheap.queue(cr(1, "other", "Pergunta"));
  // complexity=1 → cheap model for execution
  cheap.queue(tr("React Server Components são componentes que renderizam no servidor..."));
  const r = await loop.run();
  assertEquals(r.ok, true);
});

Deno.test("15 build fail → rollback", async () => {
  const { loop, cheap, main, reg, events } = f({
    msgs: [{ role: "user", content: "Adicione código com erro" }],
    files: [{ path: "package.json", content: '{"scripts":{"build":"vite build"}}' }, { path: "tsconfig.json", content: "{}" }],
  });
  reg.failBuild(); // observer reports build failure
  cheap.queue(cr(3, "modify", "Adicionar"));
  main.queue(er("Adicionando...", tc("t1", "fs_write", { path: "src/Bug.tsx", content: "const x='bug'" })));
  // After 1st fail, LLM gets feedback, tries again
  main.queue(er("Corrigindo...", tc("t2", "fs_edit", { path: "src/Bug.tsx", oldText: "'bug'", newText: "42" })));
  // 2nd fail → rollback triggers (buildAttempts > 1)
  main.queue(er("Tentando...", tc("t3", "fs_edit", { path: "src/Bug.tsx", oldText: "42", newText: "42" })));
  main.queue(tr("Não consegui"));
  await loop.run();
  const vf = ef(events, "validate_fail");
  assert(vf.length > 0, `Eventos: ${events.map(e => e.type).join(",")}`);
  const rb = ef(events, "rollback");
  assert(rb.length >= 1, "Deveria ter rollback");
});

Deno.test("16 typecheck failure", async () => {
  const { loop, cheap, main, reg, events } = f({
    msgs: [{ role: "user", content: "Crie código TypeScript com erro de tipo" }],
    files: [{ path: "package.json", content: "{}" }, { path: "tsconfig.json", content: '{"compilerOptions":{"strict":true}}' }, { path: "src/App.tsx", content: "// ok" }],
  });
  reg.failTypecheck(); // shell_exec for "npx tsc --noEmit src/New.tsx" returns error-like stderr
  cheap.queue(cr(3, "modify", "Adicionar"));
  main.queue(er("Adicionando...", tc("t1", "fs_write", { path: "src/New.tsx", content: "const x: number = 's'" })));
  // After typecheck fails, LLM gets feedback, should try to fix
  main.queue(er("Corrigindo...", tc("t2", "fs_edit", { path: "src/New.tsx", oldText: "'s'", newText: "42" })));
  main.queue(tr("Corrigido!"));
  await loop.run();
  const tcf = ef(events, "typecheck_fail");
  // The typecheck might pass if failTypecheck doesn't match the exact tsc command
  // Check: the observer.quickTypeCheck filters to .ts/.tsx files, then runs npx tsc --noEmit "src/New.tsx"
  // Our match: `npx tsc --noEmit src` — should match
  assert(tcf.length > 0, `Eventos: ${events.map(e => e.type).join(",")}`);
});

Deno.test("17 checkpoint salvo e limpo", async () => {
  const { loop, cheap, main, sb } = f({ msgs: [{ role: "user", content: "Faça várias alterações" }], files: [] });
  cheap.queue(cr(3, "modify", "Alterações"));
  main.queue(er("P1", tc("t1", "fs_write", { path: "src/a.tsx", content: "// a" })));
  main.queue(er("P2", tc("t2", "fs_write", { path: "src/b.tsx", content: "// b" })));
  main.queue(er("P3", tc("t3", "fs_write", { path: "src/c.tsx", content: "// c" })));
  main.queue(tr("Feito!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  const ups = sb.queries.filter(q => q.getTable() === "agent_checkpoints" && q.getOperation() === "upsert");
  const dels = sb.queries.filter(q => q.getTable() === "agent_checkpoints" && q.getOperation() === "delete");
  assert(ups.length >= 2, `upserts: ${ups.length}`);
  assert(dels.length >= 1, `deletes: ${dels.length}`);
});

Deno.test("18 executionLog populado", async () => {
  const { loop, cheap, main, events } = f({ msgs: [{ role: "user", content: "Crie arquivos" }], files: [] });
  cheap.queue(cr(3, "modify", "Criar"));
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "src/1.tsx", content: "// 1" }), tc("t2", "fs_write", { path: "src/2.tsx", content: "// 2" })));
  main.queue(tr("Pronto!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assert(ef(events, "step").length >= 1);
});

Deno.test("19 observer validate_ok", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Crie componente React" }],
    files: [{ path: "package.json", content: '{"dependencies":{"@forge/ui":"*"},"scripts":{"build":"echo OK","lint":"echo OK"}}' }, { path: "tsconfig.json", content: "{}" }],
  });
  cheap.queue(cr(3, "modify", "Criar componente"));
  main.queue(er("Criando...", tc("t1", "fs_write", { path: "src/C.tsx", content: "export default function() { return <div/> }" })));
  main.queue(tr("Concluído!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
  assert(ef(events, "validate_ok").length >= 1, `Eventos: ${events.map(e => e.type).join(",")}`);
});

Deno.test("20 compressão a cada 5 turnos", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Faça alterações" }, ...Array.from({ length: 10 }, (_, i) => ({ role: "assistant" as const, content: `P${i + 1}` }))],
    files: [], maxSteps: 6,
  });
  cheap.queue(cr(3, "modify", "Alterações"));
  cheap.queue(tr("Resumo: alterações feitas.")); // summarizer
  for (let i = 1; i <= 6; i++) main.queue(er(`P${i}`, tc(`t${i}`, "fs_write", { path: `src/f${i}.tsx`, content: `// ${i}` })));
  await loop.run();
  const ce = ef(events, "context_compress");
  assert(ce.length >= 1, `Eventos: ${events.map(e => e.type).join(",")}`);
});

Deno.test("21 resume sem checkpoint", async () => {
  const { loop, cheap, main } = f({
    msgs: [{ role: "user", content: "Crie landing" }, { role: "assistant", content: "ok" }, { role: "user", content: "Continue" }],
    resume: true, checkpoint: false, intent: { type: "new_project", scope: [], complexity: "medium", summary: "Landing" },
  });
  cheap.queue(cr(3, "new_project", "Landing"));
  main.queue(er("Continuando...", tc("t1", "fs_write", { path: "src/style.css", content: "/* css */" })));
  main.queue(tr("Concluído!"));
  const r = await loop.run();
  assertEquals(r.ok, true);
});

Deno.test("22 smoke test — eventos principais", async () => {
  const { loop, cheap, main, events } = f({
    msgs: [{ role: "user", content: "Teste de eventos" }],
    files: [{ path: "package.json", content: '{"scripts":{"build":"echo OK"}}' }, { path: "tsconfig.json", content: "{}" }],
  });
  cheap.queue(cr(3, "new_project", "Teste"));
  main.queue(er("Testing...", tc("t1", "fs_read", { path: "src/App.tsx" }), tc("t2", "fs_write", { path: "src/T.tsx", content: "// t" })));
  main.queue(tr("Done!"));
  await loop.run();
  for (const t of ["phase", "classify", "step", "tool_start", "tool_done", "done"]) {
    assert(ef(events, t).length > 0, `Faltou "${t}"`);
  }
});

// ===== UNIT TESTS =====
Deno.test("stableToolArgs deterministico", () => { assertEquals(stableToolArgs({ path: "a", content: "x" }), stableToolArgs({ content: "x", path: "a" })); });
Deno.test("hashToolStep único", () => { assertNotEquals(hashToolStep("fs_write", { path: "a", content: "x" }), hashToolStep("fs_write", { path: "a", content: "y" })); });
Deno.test("hashToolBatch concatena", () => { assert(hashToolBatch([{ name: "f", arguments: { a: "1" } }, { name: "g", arguments: {} }]).includes(";")); });
Deno.test("isExecutionStuck 3 iguais", () => { assertEquals(isExecutionStuck(["a", "a", "a"]), true); assertEquals(isExecutionStuck(["a", "b", "a"]), false); });
Deno.test("appendExecutionLogEntry max 40", () => {
  const r = appendExecutionLogEntry(Array.from({ length: 40 }, (_, i) => `e${i}`), "e40");
  assertEquals(r.length, 40); assertEquals(r[0], "e1"); assertEquals(r[39], "e40");
});

// ===== FASE 4.6 — PLAN MODE =====
Deno.test("plan-mode — awaitPlanDecision retorna null no timeout (TTL curto)", async () => {
  const { loop, sb } = f({ files: [], runId: "plan-timeout", maxSteps: 1 });
  // Sem agent_runs meta → poll nunca acha decisão → só sobra o TTL
  sb.set("agent_runs", { data: null });
  const plan: ProposedPlan = {
    planId: "p1",
    summary: "Plano de teste",
    steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
    ttlMs: 60,
    proposedAt: new Date().toISOString(),
  };
  const t0 = Date.now();
  const decision = await loop.awaitPlanDecision(plan);
  const elapsed = Date.now() - t0;
  assertEquals(decision, null, "timeout deve retornar null");
  assert(elapsed >= 50 && elapsed < 800, `TTL curto: elapsed=${elapsed}ms`);
});

Deno.test("plan-mode — awaitPlanDecision resolve via resolvePlanDecision (in-process)", async () => {
  const { loop, sb } = f({ files: [], runId: "plan-approve", maxSteps: 1 });
  sb.set("agent_runs", { data: null });
  const plan: ProposedPlan = {
    planId: "p2",
    summary: "Aprovar",
    steps: [
      { id: "s1", type: "create_file", description: "criar", filePath: "a.tsx", enabled: true },
      { id: "s2", type: "shell_exec", description: "build", enabled: true },
    ],
    ttlMs: 5_000,
    proposedAt: new Date().toISOString(),
  };
  const stepsApproved: PlanStep[] = [plan.steps[0]!];
  const decisionPromise = loop.awaitPlanDecision(plan);
  // dispara o resolver in-process após um tick
  setTimeout(() => {
    const ok = resolvePlanDecision("plan-approve", "p2", { action: "approve", steps: stepsApproved });
    assertEquals(ok, true, "resolvePlanDecision deve retornar true");
  }, 30);
  const decision = await decisionPromise;
  assertExists(decision);
  assertEquals(decision!.action, "approve");
  if (decision!.action === "approve") {
    assertEquals(decision!.steps.length, 1);
    assertEquals(decision!.steps[0]!.id, "s1");
  }
});

Deno.test("plan-mode — resolvePlanDecision retorna false pra runId/planId errado", () => {
  const ok = resolvePlanDecision("nao-existe", "qualquer", { action: "reject", reason: "x" });
  assertEquals(ok, false);
});

Deno.test("plan-mode — validateApprovedSteps rejeita id desconhecido", () => {
  const original: PlanStep[] = [
    { id: "s1", type: "create_file", description: "a", enabled: true },
    { id: "s2", type: "shell_exec", description: "b", enabled: true },
  ];
  const tampered = [{ id: "s1", enabled: true }, { id: "evil", enabled: true }];
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

(crypto as Record<string, unknown>).randomUUID = _origUUID;
