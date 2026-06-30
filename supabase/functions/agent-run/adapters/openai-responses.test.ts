import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chatOpenAiResponses } from "./openai-responses.ts";

function sseEvent(payload: Record<string, unknown>, event?: string): string {
  const body = `data: ${JSON.stringify(payload)}\n\n`;
  return event ? `event: ${event}\n${body}` : body;
}

Deno.test("chatOpenAiResponses — streama output_text e function_call_arguments", async () => {
  const chunks = [
    sseEvent({ type: "response.created", response: { id: "resp_1" } }, "response.created"),
    sseEvent({ type: "response.output_text.delta", delta: "Olá " }, "response.output_text.delta"),
    sseEvent({ type: "response.output_text.delta", delta: "mundo" }, "response.output_text.delta"),
    sseEvent(
      {
        type: "response.output_item.added",
        item: { type: "function_call", id: "call_1", call_id: "call_1", name: "search" },
      },
      "response.output_item.added",
    ),
    sseEvent(
      {
        type: "response.function_call_arguments.delta",
        item_id: "call_1",
        delta: "{\"query\":\"design system\"}",
      },
      "response.function_call_arguments.delta",
    ),
    sseEvent(
      {
        type: "response.completed",
        response: {
          output_text: "Olá mundo",
          usage: {
            input_tokens: 10,
            output_tokens: 4,
            total_tokens: 14,
            prompt_tokens: 10,
            completion_tokens: 4,
          },
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "Olá mundo" }],
            },
            {
              type: "function_call",
              id: "call_1",
              call_id: "call_1",
              name: "search",
              arguments: "{\"query\":\"design system\"}",
            },
          ],
        },
      },
      "response.completed",
    ),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  const originalFetch = globalThis.fetch;
  const tokens: string[] = [];

  try {
    globalThis.fetch = (async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof fetch;

    const result = await chatOpenAiResponses(
      "sk-test",
      "https://api.openai.com/v1",
      "gpt-5",
      {
        messages: [{ role: "user", content: "oi" }],
        onTokenDelta: (delta) => tokens.push(delta),
      },
    );

    assertEquals(tokens, ["Olá ", "mundo"]);
    assertEquals(result.content, "Olá mundo");
    assertEquals(result.tool_calls.length, 1);
    assertEquals(result.tool_calls[0]?.name, "search");
    assertEquals(result.tool_calls[0]?.arguments, { query: "design system" });
    assertExists(result.usage);
    assertEquals(result.usage?.total_tokens, 14);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
