/** H11 fix: padrões de "passo X de Y" e "step X / Y" só matcham no INÍCIO
 *  do texto. Antes, /\bpasso\s+\d+\s+de\s+\d+\b/i filtrava frases do usuário
 *  como "fiz o passo 3 de 4, agora falta o último" — sumindo a fala do user
 *  do chat. Agora só filtra quando o texto COMEÇA com esse padrão. */
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
  /^\s*passo\s+\d+\s*\/\s+\d+/i,
  /^\s*passo\s+\d+\s+(?:de|of)\s+\d+/i,
  /^\s*step\s+\d+\s*\/\s+\d+/i,
  /^\s*pr[oó]ximo\s+do\s+limite\s+de\s+tempo/i,
  /^\s*head\s+function\b/i,
  /^\s*max(?:imum)?\s+interactions\b/i,
  /^\s*maxSteps\b/i,
  /^\s*conclu[íi]do\s*:/i,
  /^\s*executando\s+passo\s+\d+/i,
];

const INTERNAL_EVENT_TYPES = new Set([
  "classify",
  "fsm_transition",
  "checkpoint_resume",
  "delivery_checkpoint_silent",
  "start",
  "resume",
  "context_compress",
  "explore",
  "memory",
  "robin_rotate",
  "skills",
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
  if (type === "phase") {
    const phase = typeof data.phase === "string" ? data.phase.trim().toLowerCase() : "";
    const message = typeof data.message === "string" ? data.message : "";
    if (phase && INTERNAL_PHASES.has(phase)) return true;
    if (isInternalRunText(message)) return true;
    return false;
  }
  return false;
}

export function formatSkillInvocation(data: Record<string, unknown>): string | null {
  const invokedSkills = asStringArray(data.invoked);
  const skills = [...new Set(invokedSkills)];
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
