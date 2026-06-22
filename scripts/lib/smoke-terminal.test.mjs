import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRichProgress, isTerminalHonest } from "./smoke-terminal.mjs";

describe("isRichProgress", () => {
  it("rejeita só start", () => {
    assert.equal(isRichProgress(["start"]), false);
  });

  it("aceita phase ou tool", () => {
    assert.equal(isRichProgress(["start", "phase"]), true);
    assert.equal(isRichProgress(["start", "tool_start"]), true);
  });
});

describe("isTerminalHonest", () => {
  it("rejeita running sem terminal", () => {
    assert.equal(isTerminalHonest(["start", "phase"], "running"), false);
  });

  it("aceita chunk_resume em handoff", () => {
    assert.equal(isTerminalHonest(["start", "chunk_resume"], "running"), true);
  });

  it("exige finish+rico em completed", () => {
    assert.equal(isTerminalHonest(["start", "finish"], "completed"), false);
    assert.equal(
      isTerminalHonest(["start", "phase", "assistant_text", "finish"], "completed"),
      true,
    );
  });

  it("aceita awaiting_user com done", () => {
    assert.equal(
      isTerminalHonest(["start", "tool_start", "done"], "awaiting_user"),
      true,
    );
  });
});