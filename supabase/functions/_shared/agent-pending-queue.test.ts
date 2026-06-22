import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BUSY_ZOMBIE_GAP_MS,
  CHUNK_HANDOFF_GAP_MS,
  classifyAgentBusyReason,
  expireStaleRuns,
  previewFromQueueBody,
  resolveQueuedPlanMode,
  shouldSkipStaleExpiry,
} from "./agent-pending-queue.ts";

Deno.test("previewFromQueueBody — texto direto", () => {
  const preview = previewFromQueueBody({
    text: "Adicionar botão de logout no header",
    messageId: "m1",
  });
  assertEquals(preview, "Adicionar botão de logout no header");
});

Deno.test("previewFromQueueBody — parts", () => {
  const preview = previewFromQueueBody({
    parts: [{ type: "text", text: "Refatorar App.tsx" }],
  });
  assertEquals(preview, "Refatorar App.tsx");
});

Deno.test("previewFromQueueBody — prefs only fallback", () => {
  const preview = previewFromQueueBody({ preferences: { mode: "auto" } });
  assertEquals(preview.includes("enfileirado"), true);
});

Deno.test("resolveQueuedPlanMode — pendingBody.plan vence inputPlanMode false (S7)", () => {
  assertEquals(
    resolveQueuedPlanMode({
      pendingBody: { mode: "plan", messageId: "m1" },
      inputPlanMode: false,
    }),
    true,
  );
});

Deno.test("resolveQueuedPlanMode — meta.mode plan quando body sem mode (d7de3a27)", () => {
  assertEquals(
    resolveQueuedPlanMode({
      pendingBody: { messageId: "m-plan" },
      messageMetaMode: "plan",
      inputPlanMode: false,
    }),
    true,
  );
  assertEquals(
    resolveQueuedPlanMode({
      pendingBody: { messageId: "m-plan" },
      messageMetaMode: "plan",
    }),
    true,
  );
});

Deno.test("resolveQueuedPlanMode — legacy sem mode cai em build", () => {
  assertEquals(
    resolveQueuedPlanMode({ pendingBody: { messageId: "m1" }, inputPlanMode: false }),
    false,
  );
});

Deno.test("peekOldestPendingMessage — não remove até commit explícito", async () => {
  const deleted: string[] = [];
  const mockSupabase = {
    from(table: string) {
      if (table === "projects") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: { meta: {} } };
          },
        };
      }
      if (table !== "agent_pending_messages") throw new Error("unexpected table");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return Promise.resolve({
            data: [{ id: "pending-1", body: { text: "hello", messageId: "m1" } }],
          });
        },
        delete() {
          return {
            eq(_col: string, id: string) {
              deleted.push(id);
              return Promise.resolve({ data: null });
            },
          };
        },
      };
    },
  };

  const { peekOldestPendingMessage } = await import("./agent-pending-queue.ts");
  const peeked = await peekOldestPendingMessage(
    mockSupabase as never,
    "proj",
    "user",
  );
  assertEquals(peeked?.id, "pending-1");
  assertEquals(peeked?.body.text, "hello");
  assertEquals(deleted.length, 0);
});

Deno.test("shouldSkipStaleExpiry — betweenChunks com lastChunkAt recente", () => {
  const now = Date.now();
  assertEquals(
    shouldSkipStaleExpiry({
      meta: { betweenChunks: true, lastChunkAt: new Date(now - 30_000).toISOString() },
      nowMs: now,
    }),
    true,
  );
});

Deno.test("shouldSkipStaleExpiry — betweenChunks sem lastChunkAt sempre skip", () => {
  assertEquals(shouldSkipStaleExpiry({ meta: { betweenChunks: true } }), true);
});

Deno.test("shouldSkipStaleExpiry — chunk_resume recente", () => {
  const now = Date.now();
  assertEquals(
    shouldSkipStaleExpiry({
      meta: {},
      lastEventType: "chunk_resume",
      lastEventAt: new Date(now - 10_000).toISOString(),
      nowMs: now,
    }),
    true,
  );
});

Deno.test("shouldSkipStaleExpiry — handoff expirado não skip", () => {
  const now = Date.now();
  const grace = CHUNK_HANDOFF_GAP_MS * 2;
  assertEquals(
    shouldSkipStaleExpiry({
      meta: { betweenChunks: true, lastChunkAt: new Date(now - grace - 1).toISOString() },
      nowMs: now,
    }),
    false,
  );
});

Deno.test("expireStaleRuns — betweenChunks com heartbeat velho não expira", async () => {
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const mockSupabase = {
    from(table: string) {
      if (table === "agent_runs") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return Promise.resolve({
              data: [
                {
                  id: "run-chunk",
                  meta: { betweenChunks: true, lastChunkAt: new Date().toISOString() },
                  started_at: old,
                  heartbeat_at: old,
                },
              ],
            });
          },
        };
      }
      if (table === "agent_stream_events") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          async maybeSingle() {
            return { data: { created_at: old, event_type: "chunk_resume" } };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const n = await expireStaleRuns(mockSupabase as never, "proj", 8 * 60 * 1000);
  assertEquals(n, 0);
});

Deno.test("classifyAgentBusyReason — gap longo em running vira zombie (88764445)", () => {
  assertEquals(
    classifyAgentBusyReason({
      status: "running",
      lastActivityAgeMs: BUSY_ZOMBIE_GAP_MS + 1,
    }),
    "zombie",
  );
  assertEquals(
    classifyAgentBusyReason({ status: "running", lastActivityAgeMs: 30_000 }),
    "running",
  );
  assertEquals(classifyAgentBusyReason({ otherConversation: true }), "other_conversation");
});
