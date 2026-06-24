// runtime/loop-auto-model.ts — Auto model swap por complexidade (Fase 2.2)
import { resolveAutoForComplexity } from "../../_shared/model-presets.ts";
import type { ModelRouter } from "../router.ts";
import { ResilientLLM } from "../robin-pool.ts";
import type { LLMProvider } from "../types.ts";
import type { ProviderConfig } from "../providers.ts";
import type { AgentPreferencesPayload } from "../connector-keys.ts";

export function applyAutoModelForComplexity(input: {
  preferences: AgentPreferencesPayload | null;
  connectorKeys: Record<string, string>;
  complexity: number;
  llm: LLMProvider;
  router: ModelRouter;
}): void {
  if (input.preferences?.mode !== "auto") return;

  const wire = resolveAutoForComplexity(
    input.connectorKeys,
    input.complexity,
    input.preferences.autoAllowedPresetIds,
    input.preferences.userModelEntries,
  );
  if (!wire) return;

  const newCfg: ProviderConfig = {
    provider: wire.provider,
    apiKey: wire.apiKey,
    model: wire.model,
    baseUrl: wire.baseUrl,
    label: `${wire.label} (Auto · exec c${input.complexity})`,
  };

  const cur = input.router.mainCfg;
  if (cur.provider === newCfg.provider && cur.model === newCfg.model) {
    input.router.setResolvedCfg(newCfg);
    return;
  }

  if (input.llm instanceof ResilientLLM) {
    input.llm.updateCfg(newCfg);
  }
  input.router.setResolvedCfg(newCfg);
}