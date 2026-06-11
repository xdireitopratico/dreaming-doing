import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";

const mockDelete = vi.fn();
const mockUpsert = vi.fn();
const mockSnapshotMaybeSingle = vi.fn();
const mockFilesSelect = vi.fn();
const mockFilesDelete = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "messages") {
        return {
          delete: () => ({
            eq: () => ({
              in: (_col: string, ids: string[]) => {
                mockDelete(ids);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "project_snapshots") {
        return {
          select: () => ({
            eq: () => ({
              lt: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: mockSnapshotMaybeSingle,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "project_files") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
          delete: () => ({
            eq: (...args: unknown[]) => {
              mockFilesDelete(...args);
              return Promise.resolve({ error: null });
            },
          }),
          upsert: (...args: unknown[]) => {
            mockUpsert(...args);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  },
}));

import { rollbackChatTurn } from "@/lib/rollback-chat-turn";

const messages: ChatMessage[] = [
  { id: "u1", role: "user", content: "primeiro", timestamp: 1000 },
  { id: "a1", role: "assistant", content: "resp1", timestamp: 2000 },
  { id: "u2", role: "user", content: "segundo", timestamp: 3000 },
  { id: "a2", role: "assistant", content: "resp2", timestamp: 4000 },
];

describe("rollbackChatTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSnapshotMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("remove turno do assistente e mensagens posteriores", async () => {
    const result = await rollbackChatTurn({
      projectId: "p1",
      conversationId: "c1",
      messageId: "a1",
      role: "assistant",
      messages,
    });
    expect(result.ok).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(["u1", "a1", "u2", "a2"]);
  });

  it("remove turno do usuário e mensagens posteriores", async () => {
    const result = await rollbackChatTurn({
      projectId: "p1",
      conversationId: "c1",
      messageId: "u2",
      role: "user",
      messages,
    });
    expect(result.ok).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(["u2", "a2"]);
  });
});
