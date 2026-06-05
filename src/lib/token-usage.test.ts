import { describe, expect, it } from "vitest";
import {
  estimateMessageTokens,
  INPUT_TOKEN_FORCE,
  normalizeChatUsage,
} from "@/lib/token-usage";

describe("token-usage", () => {
  it("normalizeChatUsage unifica input_tokens e prompt_tokens", () => {
    const a = normalizeChatUsage({ input_tokens: 1200, output_tokens: 80, total_tokens: 1280 });
    expect(a?.input_tokens).toBe(1200);
    expect(a?.prompt_tokens).toBe(1200);

    const b = normalizeChatUsage({ prompt_tokens: 500, completion_tokens: 50 });
    expect(b?.input_tokens).toBe(500);
    expect(b?.output_tokens).toBe(50);
  });

  it("normalizeChatUsage lida com Gemini usageMetadata", () => {
    const g = normalizeChatUsage({ promptTokenCount: 900, candidatesTokenCount: 120, totalTokenCount: 1020 });
    expect(g?.input_tokens).toBe(900);
    expect(g?.output_tokens).toBe(120);
  });

  it("estimateMessageTokens cresce com conteúdo", () => {
    const small = estimateMessageTokens([{ content: "oi" }]);
    const big = estimateMessageTokens([{ content: "x".repeat(10_000) }]);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeGreaterThan(1000);
    expect(INPUT_TOKEN_FORCE).toBeGreaterThan(big);
  });
});