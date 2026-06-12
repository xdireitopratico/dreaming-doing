// agent-fsm.test.ts — Testes da máquina de estados do agente.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyTransition, isTerminal, isAwaitingUser, type AgentStateData } from "./agent-fsm.ts";

const idle: AgentStateData = { name: "idle", since: 0 };

Deno.test("idle → send → running", () => {
  const r = applyTransition(idle, { type: "send" });
  assertEquals(r.ok, true);
  assertEquals(r.to, "running");
});

Deno.test("running → classified → planning", () => {
  const s: AgentStateData = { name: "running", since: 0, attempt: 0 };
  const r = applyTransition(s, { type: "classified", data: { complexity: 3 } });
  assertEquals(r.ok, true);
  assertEquals(r.to, "planning");
  assertEquals(r.state.classification, { complexity: 3 });
});

Deno.test("planning → plan_proposed → awaiting_plan", () => {
  const s: AgentStateData = { name: "planning", since: 0, classification: { complexity: 3 } };
  const r = applyTransition(s, { type: "plan_proposed", data: { summary: "Criar landing" } });
  assertEquals(r.ok, true);
  assertEquals(r.to, "awaiting_plan");
});

Deno.test("running → no_plan_needed → building (atalho sem planning)", () => {
  const s: AgentStateData = { name: "running", since: 0, classification: { complexity: 2 } };
  const r = applyTransition(s, { type: "no_plan_needed" });
  assertEquals(r.ok, true);
  assertEquals(r.to, "building");
  assertEquals(r.state.stepIndex, 0);
});

Deno.test("awaiting_plan → plan_approved → building", () => {
  const s: AgentStateData = { name: "awaiting_plan", since: 0, plan: { steps: [] } };
  const r = applyTransition(s, { type: "plan_approved", data: s.plan });
  assertEquals(r.ok, true);
  assertEquals(r.to, "building");
  assertEquals(r.state.stepIndex, 0);
});

Deno.test("awaiting_plan → plan_rejected → planning", () => {
  const s: AgentStateData = {
    name: "awaiting_plan",
    since: 0,
    plan: {},
    classification: { complexity: 3 },
  };
  const r = applyTransition(s, { type: "plan_rejected" });
  assertEquals(r.ok, true);
  assertEquals(r.to, "planning");
});

Deno.test("building → step_done → building (incrementa stepIndex)", () => {
  const s: AgentStateData = { name: "building", since: 0, stepIndex: 2 };
  const r = applyTransition(s, { type: "step_done" });
  assertEquals(r.ok, true);
  assertEquals(r.to, "building");
  assertEquals(r.state.stepIndex, 3);
});

Deno.test("building → all_steps_done → observing", () => {
  const s: AgentStateData = { name: "building", since: 0, stepIndex: 5 };
  const r = applyTransition(s, { type: "all_steps_done" });
  assertEquals(r.ok, true);
  assertEquals(r.to, "observing");
});

Deno.test("observing → build_passed → delivering", () => {
  const s: AgentStateData = { name: "observing", since: 0 };
  const r = applyTransition(s, { type: "build_passed", data: { files: [] } });
  assertEquals(r.ok, true);
  assertEquals(r.to, "delivering");
});

Deno.test("observing → build_failed → fixing", () => {
  const s: AgentStateData = { name: "observing", since: 0 };
  const r = applyTransition(s, { type: "build_failed", data: ["erro de tipo"] });
  assertEquals(r.ok, true);
  assertEquals(r.to, "fixing");
});

Deno.test("fixing → fixed → building", () => {
  const s: AgentStateData = { name: "fixing", since: 0, attempt: 0, errors: ["erro"] };
  const r = applyTransition(s, { type: "fixed" });
  assertEquals(r.ok, true);
  assertEquals(r.to, "building");
});

Deno.test("fixing → error 3x → failed", () => {
  const s: AgentStateData = { name: "fixing", since: 0, attempt: 2, errors: ["e1", "e2"] };
  const r = applyTransition(s, { type: "error", data: "erro 3" });
  assertEquals(r.ok, true);
  assertEquals(r.to, "failed");
  assertEquals(r.state.recoverable, true);
});

Deno.test("delivering → delivered → done", () => {
  const s: AgentStateData = { name: "delivering", since: 0, artifact: {} };
  const r = applyTransition(s, { type: "delivered" });
  assertEquals(r.ok, true);
  assertEquals(r.to, "done");
});

Deno.test("evento inválido retorna erro", () => {
  const r = applyTransition(idle, { type: "classified" });
  assertEquals(r.ok, false);
  assert(r.error?.includes("not allowed"));
});

Deno.test("isTerminal: done e failed são terminais", () => {
  assertEquals(isTerminal({ name: "done", since: 0 }), true);
  assertEquals(isTerminal({ name: "failed", since: 0 }), true);
  assertEquals(isTerminal({ name: "building", since: 0 }), false);
});

Deno.test("isAwaitingUser: só awaiting_plan", () => {
  assertEquals(isAwaitingUser({ name: "awaiting_plan", since: 0 }), true);
  assertEquals(isAwaitingUser({ name: "building", since: 0 }), false);
});