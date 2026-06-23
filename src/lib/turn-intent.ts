import type { AgentComposerMode } from "@/lib/chat-types";

export type AgentRunMode = AgentComposerMode;

export type TurnIntent =
  | { kind: "chat"; runMode: "chat"; reason: string }
  | { kind: "plan"; runMode: "plan"; reason: string }
  | { kind: "build"; runMode: "build"; reason: string };

type ResolveTurnIntentInput = {
  text: string;
  composerMode: AgentComposerMode;
  explicitMode?: AgentComposerMode;
  hasAttachments?: boolean;
};

/** Modo = composer (ou override explícito). Sem heurística de texto. */
export function resolveTurnIntent(input: ResolveTurnIntentInput): TurnIntent {
  const text = input.text.trim();
  const mode = input.explicitMode ?? input.composerMode;

  if (!text && !input.hasAttachments) {
    return { kind: "chat", runMode: "chat", reason: "empty" };
  }

  if (mode === "chat") {
    return { kind: "chat", runMode: "chat", reason: "composer_chat_mode" };
  }
  if (mode === "plan") {
    return { kind: "plan", runMode: "plan", reason: "composer_plan_mode" };
  }
  return { kind: "build", runMode: "build", reason: "composer_build_mode" };
}