import { expect, describe, it } from "vitest";
import { appendStreamEvent, clearSeqCache } from "../../supabase/functions/_shared/agent-stream.ts";

describe("appendStreamEvent", () => {
  it("não espera broadcast para concluir persistência", async () => {
    clearSeqCache("run-live");

    const calls: string[] = [];
    let broadcastResolved = false;
    const supabase = {
      channel(topic: string) {
        calls.push(`channel:${topic}`);
        return {
          httpSend: async (event: string) => {
            calls.push(`broadcast:${event}`);
            await new Promise((resolve) => setTimeout(resolve, 25));
            broadcastResolved = true;
            return "ok" as const;
          },
        };
      },
      removeChannel: async () => null,
      from(table: string) {
        expect(table).toBe("agent_stream_events");
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: async () => {
            calls.push("insert");
            return { error: null };
          },
        };
      },
    } as any;

    const seq = await appendStreamEvent(supabase, "run-live", "thinking_text", { text: "oi" });

    expect(seq).toBe(1);
    expect(calls.includes("insert")).toBe(true);
    expect(broadcastResolved).toBe(false);
  });
});
