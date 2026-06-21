const INTERNAL_TEXT_PATTERNS = [
  /^\s*classif(?:y|ying|icando)\b/i,
  /^\s*state\s*:/i,
  /^\s*estado\s*:/i,
  /^\s*skills\s*:/i,
  /^\s*continuando\s*\(parte\s+\d+\s*\/\s*\d+\)/i,
  /^\s*continuando\s+parte\s+\d+\s*\/\s*\d+/i,
  /^\s*continuando\s+do\s+passo\s+\d+\s+(?:de|\/)\s+\d+/i,
  /^\s*retomando\s+do\s+passo\s+\d+/i,
  /^\s*checkpoint\s*:\s*\d+\s+mensagens/i,
  /^\s*checkpoint\s*[,·-]?\s*0\s+(?:file|arquivo)/i,
  /^\s*trabalhando\s+no\s+pedido/i,
  /\bpasso\s+\d+\s*\/\s*\d+\b/i,
  /\bpasso\s+\d+\s+(?:de|of)\s+\d+\b/i,
  /\bstep\s+\d+\s*\/\s*\d+\b/i,
  /\bpr[oó]ximo\s+do\s+limite\s+de\s+tempo/i,
  /\bhead\s+function\b/i,
  /\bmax(?:imum)?\s+interactions\b/i,
  /\bmaxSteps\b/i,
];

const INTERNAL_EVENT_TYPES = new Set([
  "classify",
  "fsm_transition",
  "checkpoint_resume",
  "delivery_checkpoint_silent",
  "start",
  "resume",
  "context_compress",
]);

const INTERNAL_PHASES = new Set([
  "build",
  "classify",
  "execute",
  "execute_step",
  "gather",
  "observe",
  "resume",
  "summarize",
]);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function isInternalRunText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  return INTERNAL_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function sanitizeRunText(text: unknown, max = 120): string | null {
  if (typeof text !== "string") return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || isInternalRunText(normalized)) return null;
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export function isInternalRunEvent(type: string, data: Record<string, unknown> = {}): boolean {
  if (INTERNAL_EVENT_TYPES.has(type)) return true;
  const phase = typeof data.phase === "string" ? data.phase.trim().toLowerCase() : "";
  const message = typeof data.message === "string" ? data.message : "";
  if (phase && INTERNAL_PHASES.has(phase) && isInternalRunText(message || phase)) return true;
  return false;
}

export function formatSkillInvocation(data: Record<string, unknown>): string | null {
  const userSkills = asStringArray(data.user);
  const invokedSkills = asStringArray(data.invoked);
  const explicitSkills = asStringArray(data.explicit);
  const skills = [...new Set([...userSkills, ...invokedSkills, ...explicitSkills])];
  if (skills.length === 0) return null;
  return `Skill: ${skills.join(", ")}`;
}

export function checkpointFiles(data: Record<string, unknown>): string[] {
  return [...asStringArray(data.deliveryFiles), ...asStringArray(data.files)].filter(Boolean);
}

export function checkpointSummary(
  data: Record<string, unknown>,
): { text: string; files: string[] } | null {
  const files = checkpointFiles(data);
  if (files.length === 0) return null;
  return { text: `Checkpoint · ${files.length} arquivo(s)`, files };
}
