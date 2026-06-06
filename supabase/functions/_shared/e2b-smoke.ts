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

export async function probeSandboxToolchain(
  sandbox: E2bRestSandbox,
): Promise<E2bToolchainProbe> {
  try {
    const result = await sandbox.commands.run("node -v && npm -v", {
      cwd: E2B_PROJECT_DIR,
      timeoutMs: 45_000,
    });
    if (result.exitCode !== 0) {
      return {
        nodeOk: false,
        npmOk: false,
        error: (result.stderr || result.stdout || "node/npm indisponível").slice(0, 300),
      };
    }
    const lines = (result.stdout ?? "").trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const nodeLine = lines.find((l) => l.startsWith("v")) ?? lines[0];
    const npmLine = lines.find((l) => /^\d/.test(l)) ?? lines[1];
    return {
      nodeOk: !!nodeLine,
      npmOk: !!npmLine,
      nodeVersion: nodeLine,
      npmVersion: npmLine,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { nodeOk: false, npmOk: false, error: msg.slice(0, 300) };
  }
}

/** Cria sandbox com template que passa smoke npm (não deleta). */
export async function createValidatedE2bSandbox(
  apiKey: string,
): Promise<{ sandbox: E2bRestSandbox; templateUsed: string }> {
  let lastErr: unknown;
  for (const tpl of E2B_TEMPLATE_CANDIDATES) {
    let sandbox: E2bRestSandbox | null = null;
    try {
      sandbox = await e2bRestCreate(apiKey, tpl);
      const probe = await probeSandboxToolchain(sandbox);
      if (probe.npmOk && probe.nodeOk) {
        return { sandbox, templateUsed: tpl };
      }
      const err = probe.error ?? "Template sem Node/npm";
      console.warn(`[e2b-smoke] template ${tpl} sem toolchain:`, err);
      await e2bDeleteSandbox(apiKey, sandbox.sandboxId);
      lastErr = new Error(
        `Template "${tpl}" sem Node/npm (${err}). ` +
          "Confira templates disponíveis na sua conta E2B (recomendado: code-interpreter-v1).",
      );
    } catch (e) {
      if (sandbox) {
        await e2bDeleteSandbox(apiKey, sandbox.sandboxId);
      }
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Nenhum template E2B disponível com Node/npm na sua conta.");
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