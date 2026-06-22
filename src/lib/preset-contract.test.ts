import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CODING_MODEL_PRESETS } from "@/lib/model-catalog";
import {
  LEGACY_PRESET_ALIASES,
  normalizePresetId,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
  slugToPresetId,
} from "@/lib/preset-contract";

const CATALOG_IDS = new Set(CODING_MODEL_PRESETS.map((p) => p.id));

function backendPresetKeys(): Set<string> {
  const raw = readFileSync(
    resolve(process.cwd(), "supabase/functions/_shared/model-presets.ts"),
    "utf8",
  );
  const keys = new Set<string>();
  for (const m of raw.matchAll(/^\s{2}"([a-z0-9-]+)":/gm)) {
    keys.add(m[1]!);
  }
  return keys;
}

describe("preset-contract", () => {
  it("slugToPresetId converte slash slug em preset ID", () => {
    expect(slugToPresetId("anthropic/claude-opus-4-8")).toBe("anthropic--claude-opus-4-8");
    expect(slugToPresetId("nvidia/nemotron-3-ultra-550b")).toBe("nvidia--nemotron-3-ultra-550b");
  });

  it("normalizePresetId é idempotente para IDs canônicos", () => {
    for (const id of CATALOG_IDS) {
      expect(normalizePresetId(id)).toBe(id);
      expect(normalizePresetId(normalizePresetId(id))).toBe(id);
    }
  });

  it("normaliza slugs API NVIDIA e ROBIN legados", () => {
    expect(normalizePresetId("nvidia/nemotron-3-ultra-550b-a55b")).toBe(
      PLATFORM_ROBIN_TASTE_PRESET_ID,
    );
    expect(normalizePresetId("nvidia/qwen3.5-397b-a17b")).toBe("qwen--qwen3-5-397b-a17b");
  });

  it("todo preset do catálogo existe no backend PRESETS", () => {
    const backend = backendPresetKeys();
    const missing: string[] = [];
    for (const id of CATALOG_IDS) {
      if (!backend.has(id)) missing.push(id);
    }
    expect(missing, `IDs ausentes em model-presets.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("LEGACY aliases apontam para presets válidos", () => {
    const backend = backendPresetKeys();
    for (const target of Object.values(LEGACY_PRESET_ALIASES)) {
      expect(
        CATALOG_IDS.has(target) || backend.has(target),
        `alias legado inválido: ${target}`,
      ).toBe(true);
    }
  });
});