import { describe, it, expect } from "vitest";
import { buildChatThread } from "./chat-thread";
import type { ChatMessage, ChatState } from "./chat-types";

const idle: ChatState = { status: "idle", runId: null, streamText: null, error: null };

function userMsg(id: string, content: string): ChatMessage {
  return { id, role: "user", content, timestamp: Date.now() };
}

function assistantMsg(id: string, content: string, runId?: string): ChatMessage {
  return { id, role: "assistant", content, runId, timestamp: Date.now() };
}

describe("buildChatThread", () => {
  it("returns empty for empty messages and idle state", () => {
    expect(buildChatThread([], idle)).toEqual([]);
  });

  it("maps user messages", () => {
    const items = buildChatThread([userMsg("u1", "hello")], idle);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("user");
  });

  it("maps assistant messages", () => {
    const items = buildChatThread([assistantMsg("a1", "hi", "run-1")], idle);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("assistant");
    if (items[0].kind === "assistant") {
      expect(items[0].runId).toBe("run-1");
      expect(items[0].isActive).toBe(false);
    }
  });

  it("skips tool messages", () => {
    const items = buildChatThread(
      [
        userMsg("u1", "hi"),
        { id: "t1", role: "tool", content: "tool result", timestamp: Date.now() },
      ],
      idle,
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("user");
  });

  it("appends live slot when running", () => {
    const state: ChatState = {
      status: "running",
      runId: "run-1",
      streamText: "hello",
      error: null,
    };
    const items = buildChatThread([userMsg("u1", "hi")], state);
    expect(items).toHaveLength(2);
    expect(items[1].kind).toBe("assistant");
    if (items[1].kind === "assistant") {
      expect(items[1].isActive).toBe(true);
      expect(items[1].streamText).toBe("hello");
    }
  });

  it("does not duplicate live slot if already exists", () => {
    const state: ChatState = { status: "running", runId: "run-1", streamText: "hi", error: null };
    const items = buildChatThread([userMsg("u1", "hey"), assistantMsg("a1", "hi", "run-1")], state);
    const assistants = items.filter((i) => i.kind === "assistant");
    expect(assistants).toHaveLength(1);
  });

  it("merges consecutive assistant messages with same runId", () => {
    const items = buildChatThread(
      [
        userMsg("u1", "hi"),
        assistantMsg("a1", "hello", "run-1"),
        assistantMsg("a2", "world", "run-1"),
      ],
      idle,
    );
    const assistants = items.filter((i) => i.kind === "assistant");
    expect(assistants).toHaveLength(1);
  });

  it("does not merge assistant messages with different runIds", () => {
    const items = buildChatThread(
      [
        userMsg("u1", "hi"),
        assistantMsg("a1", "hello", "run-1"),
        assistantMsg("a2", "world", "run-2"),
      ],
      idle,
    );
    const assistants = items.filter((i) => i.kind === "assistant");
    expect(assistants).toHaveLength(2);
  });

  it("preserves chronological order", () => {
    const items = buildChatThread(
      [
        userMsg("u1", "first"),
        assistantMsg("a1", "reply1", "run-1"),
        userMsg("u2", "second"),
        assistantMsg("a2", "reply2", "run-2"),
      ],
      idle,
    );
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant", "user", "assistant"]);
  });
});
