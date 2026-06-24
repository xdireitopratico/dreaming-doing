// design-preflight.ts — Inventário @forge/ui + npm install/build antes do LLM codar UI.

import type { ToolRegistry } from "./registry.ts";
import {
  INVALID_FORGE_UI_IMPORT_MESSAGE,
  scanFileForViolations,
} from "./design-enforcement.ts";
import { buildDesignManifestSummary } from "./design-manifest.ts";

export const DESIGN_PREFLIGHT_TEMPLATES = new Set([
  "vite-react",
  "nextjs-app-router",
  "tanstack-start",
  "astro",
]);

export type DesignInventoryResult = {
  ok: boolean;
  missing: string[];
  warnings: string[];
};

export type DesignPreflightResult = {
  passed: boolean;
  checks: Array<{ name: string; ok: boolean; output: string }>;
  feedback?: string;
  availableComponents: string;
};

function outputIndicatesBuildFailure(output: string): boolean {
  const o = output.toLowerCase();
  return (
    o.includes("error ts") ||
    o.includes("failed to resolve import") ||
    o.includes("could not resolve") ||
    o.includes("module not found") ||
    o.includes("build failed") ||
    o.includes("rollup failed") ||
    o.includes("✘ [") ||
    o.includes("[plugin:vite")
  );
}

function shellOutput(result: { output?: unknown }): string {
  if (typeof result.output !== "object" || !result.output) {
    return String(result.output ?? "");
  }
  const o = result.output as { stderr?: string; stdout?: string };
  const stderr = o.stderr?.trim() ?? "";
  const stdout = o.stdout?.trim() ?? "";
  return stderr || stdout;
}

function readFileContent(files: Array<{ path: string; content?: string | null }>, path: string): string {
  const row = files.find((f) => f.path === path);
  return row?.content ?? "";
}

/** Verifica seed mínimo de @forge/ui no project_files (DB). */
export function auditDesignInventory(
  files: Array<{ path: string; content?: string | null }>,
): DesignInventoryResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  const pkg = readFileContent(files, "package.json");
  if (!pkg.trim()) {
    missing.push("package.json");
  } else if (!pkg.includes("@forge/ui") || !pkg.includes("packages/forge-ui")) {
    missing.push('package.json — dependência "@forge/ui": "file:./packages/forge-ui"');
  }

  if (!files.some((f) => f.path === "packages/forge-ui/package.json")) {
    missing.push("packages/forge-ui/package.json");
  }
  if (!files.some((f) => f.path === "packages/forge-ui/src/index.ts")) {
    missing.push("packages/forge-ui/src/index.ts");
  }

  const css = readFileContent(files, "src/index.css");
  if (!css.includes("@theme")) {
    warnings.push("src/index.css sem @theme — tokens de design podem faltar");
  }

  for (const f of files) {
    if (!/\.(tsx|ts)$/.test(f.path)) continue;
    if (!f.content) continue;
    for (const v of scanFileForViolations(f.path, f.content)) {
      if (v.message === INVALID_FORGE_UI_IMPORT_MESSAGE) {
        warnings.push(`${f.path}: ${v.message}`);
      }
    }
  }

  return { ok: missing.length === 0, missing, warnings };
}

/** Manifesta catálogo verdadeiro para o contexto do LLM (Tier 0 resumido). */
export function buildAvailableComponentsManifest(): string {
  return buildDesignManifestSummary();
}

async function sandboxPathExists(reg: ToolRegistry, path: string): Promise<boolean> {
  const result = await reg.execute({
    id: crypto.randomUUID(),
    name: "shell_exec",
    arguments: {
      command: `test -e "${path.replace(/"/g, '\\"')}" && echo yes || echo no`,
    },
  });
  const output = shellOutput(result);
  return output.trim().endsWith("yes");
}

/** Sync (via shell_exec) + npm install + build smoke no sandbox. */
export async function runDesignPreflight(reg: ToolRegistry): Promise<DesignPreflightResult> {
  const checks: Array<{ name: string; ok: boolean; output: string }> = [];
  const availableComponents = buildAvailableComponentsManifest();

  try {
    const hasPackageJson = await sandboxPathExists(reg, "package.json");
    if (!hasPackageJson) {
      checks.push({ name: "preflight", ok: false, output: "package.json ausente no sandbox" });
      return {
        passed: false,
        checks,
        feedback: "[preflight] package.json ausente no sandbox após sync",
        availableComponents,
      };
    }

    const hasNodeModules = await sandboxPathExists(reg, "node_modules");
    if (!hasNodeModules) {
      const install = await reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: { command: "npm install 2>&1" },
      });
      const installOutput = shellOutput(install);
      checks.push({ name: "install", ok: install.ok, output: installOutput.slice(0, 3000) });
      if (!install.ok || outputIndicatesBuildFailure(installOutput)) {
        return {
          passed: false,
          checks,
          feedback: `[install] ${installOutput.slice(0, 2000)}`,
          availableComponents,
        };
      }
    } else {
      checks.push({ name: "install", ok: true, output: "(node_modules já presente)" });
    }

    const build = await reg.execute({
      id: crypto.randomUUID(),
      name: "shell_exec",
      arguments: { command: "npm run build 2>&1" },
    });
    const buildOutput = shellOutput(build);
    const buildOk = build.ok && !outputIndicatesBuildFailure(buildOutput);
    checks.push({ name: "build", ok: buildOk, output: buildOutput.slice(0, 3000) });

    if (!buildOk) {
      return {
        passed: false,
        checks,
        feedback: `[build] ${buildOutput.slice(0, 4000)}`,
        availableComponents,
      };
    }

    return { passed: true, checks, availableComponents };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "preflight falhou";
    checks.push({ name: "preflight", ok: false, output: msg });
    return { passed: false, checks, feedback: `[preflight] ${msg}`, availableComponents };
  }
}

/** Templates web que exigem preflight de design system. */
export function needsDesignPreflight(projectTemplate: string): boolean {
  return DESIGN_PREFLIGHT_TEMPLATES.has(projectTemplate);
}