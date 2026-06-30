// runtime/loop-config.ts — Budget, limits e helpers puros do AgentLoop (Fase 2.2)

const ANDROID_NATIVE_PATH_RE =
  /(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradle\.properties|gradlew|app\/src\/main\/|\.kt$|AndroidManifest\.xml)/i;

export function isAndroidNativePath(path: string): boolean {
  return ANDROID_NATIVE_PATH_RE.test(path.replace(/^\//, ""));
}

export function isGradleCommand(command: string): boolean {
  return /gradle|gradlew|assembleDebug|assembleRelease/i.test(command);
}

/** build_log para Gradle e comandos web (npm/vite/tsc/eslint/jest/vitest). */
export function isBuildCommand(command: string): boolean {
  if (isGradleCommand(command)) return true;
  return /\b(npm|yarn|pnpm|bun|npx)\s+(run\s+)?(build|dev|preview|test|lint|typecheck|check)|\bvite\s+(build|preview|dev)\b|\btsc\b|--noEmit|eslint|vitest|jest\s+run/i.test(
    command,
  );
}

export function resolveLoopBudgetMs(env?: {
  agentLoopBudgetMs?: string;
  inngestExecutor?: string;
}): number {
  const raw = env?.agentLoopBudgetMs;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const inngest = env?.inngestExecutor === "1";
  return inngest ? 270_000 : 90_000;
}

export function readLoopBudgetMsFromRuntime(): number {
  const raw =
    (typeof globalThis.Deno !== "undefined" ? Deno.env.get("AGENT_LOOP_BUDGET_MS") : undefined) ??
    (typeof process !== "undefined" ? process.env.AGENT_LOOP_BUDGET_MS : undefined);
  const inngest =
    (typeof process !== "undefined" && process.env.INNGEST_EXECUTOR === "1") ||
    (typeof globalThis.Deno !== "undefined" && Deno.env.get("INNGEST_EXECUTOR") === "1");
  return resolveLoopBudgetMs({
    agentLoopBudgetMs: raw,
    inngestExecutor: inngest ? "1" : undefined,
  });
}

export const THINKING_STREAM_CAP_MS = 45_000;

export function calculateMaxSteps(complexity: 1 | 2 | 3 | 4 | 5): number {
  const limits: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 50,
    2: 60,
    3: 70,
    4: 85,
    5: 100,
  };
  return limits[complexity] ?? 60;
}

export function calculateMaxTokens(complexity: 1 | 2 | 3 | 4 | 5): number {
  const limits: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 4096,
    2: 6144,
    3: 8192,
    4: 12288,
    5: 16384,
  };
  return limits[complexity] ?? 16384;
}

/** Cap meta JSONB em 50KB para não estourar Realtime. */
export const META_MAX_BYTES = 50_000;

export function capMetaSize(meta: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(meta);
  if (json.length <= META_MAX_BYTES) return meta;

  if (Array.isArray(meta.executionLog) && meta.executionLog.length > 20) {
    meta.executionLog = (meta.executionLog as unknown[]).slice(-20);
  }
  if (typeof meta.streamTail === "string" && meta.streamTail.length > 2000) {
    meta.streamTail = (meta.streamTail as string).slice(-2000);
  }
  if (meta.cardSnapshot && typeof meta.cardSnapshot === "object") {
    const cs = meta.cardSnapshot as Record<string, unknown>;
    if (Array.isArray(cs.timeline) && cs.timeline.length > 30) {
      cs.timeline = (cs.timeline as unknown[]).slice(-30);
    }
  }
  return meta;
}
