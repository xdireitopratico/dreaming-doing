// runtime/emitter.test.ts — Contrato do RuntimeEmitter (Fase 2.1)
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RuntimeEmitter, TIMELINE_EVENT_TYPES } from "./emitter.ts";
import { AGENT_STREAM_EVENT_TYPES, type AgentStreamEventType } from "../_events.ts";

type Captured = { type: string; data: unknown };

function captureEmitter(opts?: { taskPhase?: string }) {
  const events: Captured[] = [];
  const emitter = new RuntimeEmitter(
    (e) => events.push({ type: e.type, data: e.data }),
    { getTaskPhase: () => opts?.taskPhase ?? "execute" },
  );
  return { emitter, events };
}

Deno.test("phase — enriquece task_title quando ausente", () => {
  const { emitter, events } = captureEmitter();
  emitter.emit("phase", { phase: "gather", message: "Lendo arquivos" });
  assertEquals(events.length, 1);
  const data = events[0].data as Record<string, unknown>;
  assertEquals(data.task_title, "Entender o que já existe no projeto");
  assertEquals(emitter.getTailBuffer().length, 0);
});

Deno.test("phase — preserva task_title explícito", () => {
  const { emitter, events } = captureEmitter();
  emitter.emit("phase", {
    phase: "build",
    message: "Custom",
    task_title: "Título fixo",
  });
  const data = events[0].data as Record<string, unknown>;
  assertEquals(data.task_title, "Título fixo");
});

Deno.test("tool_start — enriquece step_intent, task_phase e file_paths", () => {
  const { emitter, events } = captureEmitter({ taskPhase: "build" });
  emitter.emit("tool_start", {
    name: "fs_edit",
    args: { path: "src/App.tsx" },
  });
  const data = events[0].data as Record<string, unknown>;
  assertEquals(data.task_phase, "build");
  assert(typeof data.step_intent === "string" && data.step_intent.length > 0);
  assertEquals(data.file_paths, ["src/App.tsx"]);
});

Deno.test("validate_ok — apenas emite o evento canônico", () => {
  const { emitter, events } = captureEmitter();
  emitter.emit("validate_ok", { message: "Tudo certo" });
  assertEquals(events.length, 1);
  assertEquals(events[0].type, "validate_ok");
});

Deno.test("validate_fail — apenas emite o evento canônico", () => {
  const { emitter, events } = captureEmitter();
  emitter.emit("validate_fail", { feedback: "TS2304: cannot find name" });
  assertEquals(events.length, 1);
  assertEquals(events[0].type, "validate_fail");
});

Deno.test("timeline — bufferiza apenas tipos de TIMELINE_EVENT_TYPES", () => {
  const { emitter } = captureEmitter();
  emitter.emit("fsm_transition", { from: "idle", to: "running" });
  assertEquals(emitter.getTailBuffer().length, 0);
  emitter.emit("step_result", { summary: "ok", ok: true });
  assertEquals(emitter.getTailBuffer().length, 1);
});

Deno.test("timeline — cap em 200 entradas (ring buffer)", () => {
  const { emitter } = captureEmitter();
  const small = new RuntimeEmitter(() => {}, { tailCap: 3 });
  for (let i = 0; i < 5; i++) {
    small.emit("step_result", { summary: `tick-${i}`, ok: true });
  }
  const tail = small.getTailBuffer();
  assertEquals(tail.length, 3);
  assertEquals((tail[0].data as Record<string, unknown>).summary, "tick-2");
  assertEquals((tail[2].data as Record<string, unknown>).summary, "tick-4");
});

Deno.test("tailSlice — retorna últimos N eventos", () => {
  const { emitter } = captureEmitter();
  for (let i = 0; i < 10; i++) {
    emitter.emit("step_result", { summary: String(i), ok: true });
  }
  const slice = emitter.tailSlice(3);
  assertEquals(slice.length, 3);
  assertEquals((slice[0].data as Record<string, unknown>).summary, "7");
});

Deno.test("contrato — TIMELINE_EVENT_TYPES ⊆ AGENT_STREAM_EVENT_TYPES (exceto memory)", () => {
  const contract = new Set(AGENT_STREAM_EVENT_TYPES);
  for (const t of TIMELINE_EVENT_TYPES) {
    if (t === "memory") continue; // deprecated, sem emissor ativo
    assert(contract.has(t as AgentStreamEventType), `timeline type "${t}" missing from contract`);
  }
});
