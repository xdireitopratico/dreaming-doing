import { E2B_PROJECT_DIR } from "../_shared/e2b.ts";
import type { E2bRestSandbox } from "../_shared/e2b-rest.ts";

const FORGE_DIR = `${E2B_PROJECT_DIR}/.forge`;

export type WorkerRunConfig = {
  runId: string;
  projectId: string;
  conversationId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
  resume: boolean;
  maxSteps: number;
  workerMaxMs: number;
  systemPrompt: string;
  llm: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
  env: Record<string, string>;
};

/** Secrets de deploy/CLI injetados no shell do sandbox (cliente livre). */
export function buildSandboxEnv(
  connectorKeys: Record<string, string>,
  deployKeys: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const merge = { ...connectorKeys, ...deployKeys };
  for (const [k, v] of Object.entries(merge)) {
    if (v?.trim()) out[k] = v.trim();
  }
  return out;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export async function bootstrapE2bWorker(
  sandbox: E2bRestSandbox,
  runnerSource: string,
  config: WorkerRunConfig,
): Promise<void> {
  await sandbox.commands.run(`mkdir -p ${FORGE_DIR}`, { cwd: E2B_PROJECT_DIR, timeoutMs: 8_000 });
  await sandbox.commands.run("pkill -f 'runner.mjs' 2>/dev/null || true", {
    cwd: E2B_PROJECT_DIR,
    timeoutMs: 5_000,
  });

  await sandbox.files.write([
    { path: `${FORGE_DIR}/runner.mjs`, data: runnerSource },
    { path: `${FORGE_DIR}/run.json`, data: JSON.stringify(config) },
    { path: `${FORGE_DIR}/events.ndjson`, data: "" },
  ]);

  const exports = Object.entries(config.env)
    .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
    .join("; ");

  const startCmd = exports
    ? `${exports}; cd ${E2B_PROJECT_DIR} && nohup node ${FORGE_DIR}/runner.mjs >> ${FORGE_DIR}/runner.log 2>&1 &`
    : `cd ${E2B_PROJECT_DIR} && nohup node ${FORGE_DIR}/runner.mjs >> ${FORGE_DIR}/runner.log 2>&1 &`;

  await sandbox.commands.run(startCmd, {
    cwd: E2B_PROJECT_DIR,
    timeoutMs: 15_000,
    background: true,
  });

  await new Promise((r) => setTimeout(r, 2_000));
  const alive = await sandbox.commands.run(
    "pgrep -f 'runner.mjs' >/dev/null && echo alive || echo dead",
    { cwd: E2B_PROJECT_DIR, timeoutMs: 5_000 },
  );
  if ((alive.stdout ?? "").includes("dead")) {
    const log = await sandbox.commands.run(
      `tail -40 ${FORGE_DIR}/runner.log 2>/dev/null || echo '(sem log)'`,
      { cwd: E2B_PROJECT_DIR, timeoutMs: 8_000 },
    );
    const tail = (log.stdout ?? "").trim().slice(-500);
    throw new Error(
      tail
        ? `Agente não iniciou no sandbox: ${tail}`
        : "Agente não iniciou no sandbox — verifique Node/npm no template E2B.",
    );
  }
}