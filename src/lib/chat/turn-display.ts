import type { AgentProgress } from "@/lib/agent-progress";
import type { AgentRunView } from "@/lib/forge-run";
import { collapseNarrationBuffer } from "@/lib/narration-dedupe";

export function resolveTurnNarration(
  resolved: AgentProgress | null,
  _runView: AgentRunView | null,
  _streamText: string | null,
): string | null {
  const raw = resolved?.narrationText?.trim() || null;
  if (!raw) return null;
  const collapsed = collapseNarrationBuffer(raw).trim();
  return collapsed || null;
}
