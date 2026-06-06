import { E2B_PROJECT_DIR } from "../_shared/e2b.ts";
import type { E2bRestSandbox } from "../_shared/e2b-rest.ts";

const FORGE_DIR = `${E2B_PROJECT_DIR}/.forge`;
const EVENTS_PATH = `${FORGE_DIR}/events.ndjson`;
const RUNNER_LOG_PATH = `${FORGE_DIR}/runner.log`;
const POLL_MS = 450;
/** Cada invocação Edge relay fica abaixo do wall-clock (400s) com margem. */
export const WORKER_RELAY_MS = 85_000;
const WORKER_START_GRACE_MS = 8_000;

export type StreamWorkerResult = {
  ok: boolean;
  steps: number;
  error?: string;
  resumable?: boolean;
  canceled?: boolean;
  handoff?: boolean;
  offset: number;
};

export type StreamWorkerOptions = {
  startOffset?: number;
  maxRelayMs?: number;
};

export async function streamWorkerEvents(
  sandbox: E2bRestSandbox,
  emit: (payload: Record<string, unknown>) => void,
  isCanceled: () => Promise<boolean>,
  options?: StreamWorkerOptions,
): Promise<StreamWorkerResult> {
  let offset = options?.startOffset ?? 0;
  const maxRelayMs = options?.maxRelayMs ?? WORKER_RELAY_MS;
  let steps = 0;
  let result: StreamWorkerResult = {
    ok: false,
    steps: 0,
    resumable: true,
    offset,
  };
  const started = Date.now();

  while (Date.now() - started < maxRelayMs) {
    if (await isCanceled()) {
      await sandbox.commands.run("pkill -f 'runner.mjs' 2>/dev/null || true", {
        cwd: E2B_PROJECT_DIR,
        timeoutMs: 5_000,
      });
      return { ok: false, steps, error: "Cancelado", canceled: true, resumable: false, offset };
    }

    const tail = await sandbox.commands.run(
      `wc -c < ${EVENTS_PATH} 2>/dev/null || echo 0`,
      { cwd: E2B_PROJECT_DIR, timeoutMs: 8_000 },
    );
    const size = Number.parseInt((tail.stdout ?? "0").trim(), 10) || 0;

    if (size > offset) {
      const chunk = await sandbox.commands.run(
        `tail -c +${offset + 1} ${EVENTS_PATH}`,
        { cwd: E2B_PROJECT_DIR, timeoutMs: 12_000 },
      );
      offset = size;
      const lines = (chunk.stdout ?? "").split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const { type, ts: _ts, ...rest } = parsed;
          const eventType = String(type ?? "unknown");
          emit({ type: eventType, ...rest });
          if (eventType === "step" && typeof rest.current === "number") {
            steps = rest.current;
          }
          if (eventType === "finish") {
            result = {
              ok: rest.ok === true,
              steps: typeof rest.steps === "number" ? rest.steps : steps,
              error: typeof rest.error === "string" ? rest.error : undefined,
              resumable: rest.resumable === true,
              canceled: rest.canceled === true,
              offset,
            };
            return result;
          }
        } catch {
          /* linha parcial */
        }
      }
    } else {
      const alive = await sandbox.commands.run(
        "pgrep -f 'runner.mjs' >/dev/null && echo alive || echo dead",
        { cwd: E2B_PROJECT_DIR, timeoutMs: 5_000 },
      );
      const workerDead = (alive.stdout ?? "").includes("dead");
      if (workerDead && (offset > 0 || Date.now() - started > WORKER_START_GRACE_MS)) {
        const log = await sandbox.commands.run(
          `tail -30 ${RUNNER_LOG_PATH} 2>/dev/null || echo '(sem log do agente)'`,
          { cwd: E2B_PROJECT_DIR, timeoutMs: 8_000 },
        );
        const tail = (log.stdout ?? "").trim().slice(-400);
        return {
          ok: false,
          steps,
          error: tail
            ? `Agente parou: ${tail}`
            : "Agente parou antes de responder — tente Continuar no chat.",
          resumable: true,
          offset,
        };
      }
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  emit({ type: "relay_handoff", offset, message: "Continuando…" });
  return { ok: false, steps, handoff: true, resumable: true, offset };
}