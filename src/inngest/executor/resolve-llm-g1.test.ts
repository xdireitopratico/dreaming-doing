import { describe, it, expect, vi } from "vitest";
import { resolveLlmConfigForG1Model } from "./design-dna-extraction";

describe("resolveLlmConfigForG1Model — connectorEnv vs transport provider", () => {
  it("usa connector nvidia (não openai) quando G1 validou ROBIN NIM", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            not: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: [
                    {
                      kind: "openai",
                      provider: "openai",
                      token_encrypted: "sk-openai",
                      meta: { baseUrl: "https://api.openai.com/v1" },
                    },
                    {
                      kind: "openai",
                      provider: "nvidia",
                      token_encrypted: "nvapi-test",
                      meta: { baseUrl: "https://integrate.api.nvidia.com/v1" },
                    },
                  ],
                })),
              })),
            })),
          })),
        })),
      })),
    };

    const wire = await resolveLlmConfigForG1Model(
      supabase as never,
      "user-1",
      {
        model: "moonshotai/kimi-k2.6",
        label: "Kimi K2.6",
        provider: "openai",
        connectorEnv: "nvidia",
        supportsVision: true,
      },
    );

    expect(wire).not.toBeNull();
    expect(wire?.baseUrl).toBe("https://integrate.api.nvidia.com/v1");
    expect(wire?.model).toBe("moonshotai/kimi-k2.6");
    expect(wire?.apiKey).toBe("nvapi-test");
    expect(wire?.protocol).toBe("openai");
    expect(wire?.resolvedFrom).toBe("capabilities.g1");
  });
});