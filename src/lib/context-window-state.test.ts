import { describe, expect, it } from "vitest";
import { deriveContextWindowUsage, estimateConversationUsageTokens } from "@/lib/context-window-state";
import type { ChatMessage } from "@/lib/chat-types";

function msg(id: string, content: string): ChatMessage {
  return {
    id,
    role: "user",
    content,
    timestamp: Date.now(),
  };
}

describe("context-window-state", () => {
  it("deriva consumo do histórico persistido quando não há stream ao vivo", () => {
    const messages = [msg("1", "x".repeat(3500))];
    const usage = deriveContextWindowUsage(messages, {
      mode: "manual",
      windowTokens: 1000,
    });

    expect(usage.usageTokens).toBe(estimateConversationUsageTokens(messages));
    expect(usage.windowTokens).toBe(1000);
    expect(usage.percent).toBe(100);
    expect(usage.mode).toBe("manual");
    expect(usage.compacting).toBe(false);
  });

  it("respeita a configuração atual do usuário acima de qualquer janela antiga", () => {
    const messages = [msg("1", "x".repeat(700))];
    const usage = deriveContextWindowUsage(
      messages,
      {
        mode: "auto",
        windowTokens: 1_000_000,
      },
      {
        usageTokens: 700,
        windowTokens: 128_000,
        percent: 0.5,
        mode: "manual",
        compacting: false,
      },
    );

    expect(usage.usageTokens).toBe(700);
    expect(usage.windowTokens).toBe(1_000_000);
    expect(usage.percent).toBe(0.1);
    expect(usage.mode).toBe("auto");
  });

  it("mantém overlay do stream ao vivo enquanto o run está ativo", () => {
    const usage = deriveContextWindowUsage(
      [msg("1", "oi")],
      {
        mode: "manual",
        windowTokens: 2000,
      },
      {
        usageTokens: 900,
        windowTokens: 256,
        percent: 100,
        mode: "auto",
        compacting: true,
      },
    );

    expect(usage.usageTokens).toBe(900);
    expect(usage.windowTokens).toBe(2000);
    expect(usage.percent).toBe(45);
    expect(usage.mode).toBe("manual");
    expect(usage.compacting).toBe(true);
  });
});
