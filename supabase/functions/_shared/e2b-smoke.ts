/**
 * Smoke test E2B — valida chave, template e toolchain Node/npm antes de gravar sandbox no projeto.
 */
import {
  E2B_PROJECT_DIR,
  E2B_TEMPLATE_CANDIDATES,
  e2bDeleteSandbox,
} from "./e2b.ts";
import { e2bRestCreate, type E2bRestSandbox } from "./e2b-rest.ts";

export type E2bToolchainProbe = {
  nodeOk: boolean;
  npmOk: boolean;
  nodeVersion?: string;
  npmVersion?: string;
  error?: string;
};

export type E2bSmokeResult = {
  ok: boolean;
  keyOk: boolean;
  templateUsed: string | null;
  nodeOk: boolean;
  npmOk: boolean;
  nodeVersion?: string;
  npmVersion?: string;
  latencyMs: number;
  error?: string;
};

function parseToolchainOutput(stdout: string): Pick<E2bToolchainProbe, "nodeOk" | "npmOk" | "nodeVersion" | "npmVersion"> {
  const lines = stdout.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const nodeLine = lines.find((l) => /^v\d/.test(l)) ?? lines.find((l) => l.includes("node"));
  const npmLine = lines.find((l) => /^\d+\.\d+/.test(l)) ?? lines.find((l) => l.includes("npm"));
  return {
    nodeOk: !!nodeLine,
    npmOk: !!npmLine,
    nodeVersion: nodeLine,
    npmVersion: npmLine,
  };
}

export async function probeSandboxToolchain(
  sandbox: E2bRestSandbox,
  attempts = 3,
): Promise<E2bToolchainProbe> {
  let lastError = "node/npm indisponível";

  for (let i = 0; i < attempts; i++) {
    try {
      const result = await sandbox.commands.run(
        "export PATH=\"/usr/local/bin:/usr/bin:/bin:$PATH\"; node -v && npm -v",
        { cwd: E2B_PROJECT_DIR, timeoutMs: 45_000 },
      );

      if (result.exitCode === 0) {
        const parsed = parseToolchainOutput(result.stdout ?? "");
        if (parsed.nodeOk && parsed.npmOk) return parsed;
        lastError = `stdout vazio ou incompleto: "${(result.stdout ?? "").slice(0, 120)}"`;
      } else {
        lastError = (result.stderr || result.stdout || `exit ${result.exitCode}`).slice(0, 300);
      }
    } catch (e) {
      lastError = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    }

    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
  }

  return { nodeOk: false, npmOk: false, error: lastError };
}

function isExecStreamError(msg: string): boolean {
  return msg.includes("sem evento end") || msg.includes("stream Connect incompleto");
}

/** Cria sandbox com template que passa smoke npm (não deleta). */
export async function createValidatedE2bSandbox(
  apiKey: string,
  metadata?: Record<string, string>,
): Promise<{ sandbox: E2bRestSandbox; templateUsed: string }> {
  let lastErr: unknown;
  let lastProbeErr = "";
  let templatesTried: string[] = [];

  for (const tpl of E2B_TEMPLATE_CANDIDATES) {
    let sandbox: E2bRestSandbox | null = null;
    templatesTried.push(tpl);
    try {
      sandbox = await e2bRestCreate(apiKey, tpl, undefined, metadata);
      const probe = await probeSandboxToolchain(sandbox);
      if (probe.npmOk && probe.nodeOk) {
        return { sandbox, templateUsed: tpl };
      }
      const err = probe.error ?? "node/npm indisponível";
      lastProbeErr = err;
      console.warn(`[e2b-smoke] template ${tpl} falhou toolchain:`, err);
      await e2bDeleteSandbox(apiKey, sandbox.sandboxId);

      if (isExecStreamError(err)) {
        lastErr = new Error(
          `E2B exec falhou (${err}). Templates testados: ${templatesTried.join(", ")}. ` +
            "Isso costuma ser protocolo Connect/envd, não falta de Node no template.",
        );
        break;
      }

      lastErr = new Error(
        `Template "${tpl}" sem Node/npm (${err}). ` +
          "Confira templates disponíveis na sua conta E2B (recomendado: code-interpreter-v1).",
      );
    } catch (e) {
      if (sandbox) {
        await e2bDeleteSandbox(apiKey, sandbox.sandboxId);
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (isExecStreamError(msg)) {
        lastErr = new Error(
          `E2B exec falhou (${msg}). Templates testados: ${templatesTried.join(", ")}.`,
        );
        break;
      }
      lastErr = e;
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error(
    lastProbeErr
      ? `Nenhum template E2B passou no smoke (${lastProbeErr}). Tentados: ${templatesTried.join(", ")}.`
      : "Nenhum template E2B disponível com Node/npm na sua conta.",
  );
}

/** Teste completo (cria → smoke → deleta). Usado em e2b-health e save de chave. */
export async function runE2bSmokeTest(apiKey: string): Promise<E2bSmokeResult> {
  const started = Date.now();
  let sandboxId: string | null = null;
  try {
    const { sandbox, templateUsed } = await createValidatedE2bSandbox(apiKey);
    sandboxId = sandbox.sandboxId;
    const probe = await probeSandboxToolchain(sandbox);
    await sandbox.files.write([{ path: `${E2B_PROJECT_DIR}/.forge-health`, data: "ok" }]);
    return {
      ok: true,
      keyOk: true,
      templateUsed,
      nodeOk: probe.nodeOk,
      npmOk: probe.npmOk,
      nodeVersion: probe.nodeVersion,
      npmVersion: probe.npmVersion,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const keyOk = !msg.includes("401") && !msg.includes("403") && !msg.toLowerCase().includes("api key");
    return {
      ok: false,
      keyOk,
      templateUsed: null,
      nodeOk: false,
      npmOk: false,
      latencyMs: Date.now() - started,
      error: msg.slice(0, 400),
    };
  } finally {
    if (sandboxId) await e2bDeleteSandbox(apiKey, sandboxId);
  }
}