import { getPresetById, normalizePresetId } from "@/lib/model-catalog";
import type { AgentPreferences } from "@/lib/agent-preferences";

/** Heurística: modelos com suporte multimodal (imagem) conhecidos no FORGE. */
const VISION_SLUG_HINTS =
  /gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4|claude-3|claude-sonnet-4|claude-opus-4|gemini-2\.|gemini-3|grok-2-vision|llava|vision|pixtral|qwen-vl|nemotron.*vision/i;

export function presetSupportsVision(presetId: string): boolean {
  const id = normalizePresetId(presetId);
  if (!id) return false;
  try {
    const p = getPresetById(id);
    const hay = `${p.model} ${p.openRouterSlug} ${p.label}`;
    return VISION_SLUG_HINTS.test(hay);
  } catch {
    return VISION_SLUG_HINTS.test(id);
  }
}

export function activeAgentSupportsVision(prefs: AgentPreferences): boolean {
  if (prefs.mode === "robin") {
    return presetSupportsVision(prefs.robinPoolModelId ?? "");
  }
  if (prefs.mode === "fixed") {
    return presetSupportsVision(prefs.fixedPresetId ?? "");
  }
  if (prefs.mode === "auto") {
    return (prefs.autoAllowedPresetIds ?? []).some((id) => presetSupportsVision(id));
  }
  return false;
}