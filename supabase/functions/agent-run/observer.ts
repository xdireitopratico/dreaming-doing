// observer.ts — Runtime Observation Loop
// Observa build, typecheck, console errors e auto-corrige
import type { ToolRegistry } from "./registry.ts";
import {
  formatDesignFeedback,
  INVALID_FORGE_UI_IMPORT_MESSAGE,
  scanFileForViolations,
  scanProjectForLandingQuality,
  type DesignViolation,
} from "./design-enforcement.ts";

export interface ObservationResult {
  passed: boolean;
  checks: Array<{ name: string; ok: boolean; output: string }>;
  feedback?: string;
}

export interface TypeCheckResult {
  ok: boolean;
  errors: Array<{ file: string; line: number; column: number; message: string; code: string }>;
  output: string;
}

/** C6 fix: regex mais amplo para detectar falhas de build/TypeScript/Vite/eslint.
 *  Antes: só pegava "error ts*", "failed to resolve", "module not found".
 *  Erros TS comuns (Cannot find name, Property does not exist, etc) passavam
 *  despercebidos e o build reportava 'ok: true' mesmo quebrado.
 *  Agora: cobre TS errors, Vite errors, esbuild errors, eslint errors,
 *  dependency conflicts (ERESOLVE), e exit codes não-zero. */
function outputIndicatesBuildFailure(output: string): boolean {
  const o = output.toLowerCase();
  // Exit code não-zero no output (caso tenha sido capturado)
  if (/exit\s*code\s*[1-9]\d*/i.test(o)) return true;
  return (
    // TypeScript errors
    o.includes("error ts") ||
    o.includes("cannot find name") ||
    o.includes("cannot find module") ||
    (o.includes("property ") && o.includes("does not exist on type")) ||
    (o.includes("argument of type") && o.includes("is not assignable")) ||
    (o.includes("type ") && o.includes("is not assignable to type")) ||
    o.includes("ts(") || // ts(2304), ts(2322), etc
    o.includes("ts error") ||
    // Import/Module errors
    o.includes("failed to resolve import") ||
    o.includes("failed to resolve") ||
    o.includes("could not resolve") ||
    o.includes("module not found") ||
    o.includes("cannot find package") ||
    // Vite/Rollup/esbuild errors
    o.includes("build failed") ||
    o.includes("rollup failed") ||
    o.includes("esbuild error") ||
    o.includes("vite error") ||
    o.includes("✘ [") ||
    o.includes("[plugin:vite") ||
    o.includes("internal server error") ||
    // ESLint
    o.includes("eslint error") ||
    o.includes("lint error") ||
    // Dependency conflicts
    o.includes("eresolve") ||
    o.includes("peer dep") ||
    o.includes("peer dependency") ||
    // npm/yarn/pnpm errors
    o.includes("npm err!") ||
    o.includes("npm error") ||
    o.includes("yarn error") ||
    o.includes("pnpm error") ||
    // tsc / build direct errors
    o.includes("compilation failed") ||
    o.includes("type error:") ||
    o.includes("syntax error:")
  );
}

function shellOutput(result: { output?: unknown; error?: string }): string {
  if (typeof result.output === "object" && result.output) {
    const o = result.output as { stderr?: string; stdout?: string };
    return o.stderr ?? o.stdout ?? result.error ?? "";
  }
  if (typeof result.output === "string" && result.output) return result.output;
  return result.error ?? "";
}

/** H2 fix: strip ANSI escape codes do output.
 *  npm, vite, tsc e esbuild jogam códigos ANSI (\u001b[31m, \u001b[0m)
 *  que ocupam tokens do LLM sem informação útil. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").replace(/\u001b\][^\u0007]*\u0007/g, "");
}

export class RuntimeObserver {
  private reg: ToolRegistry;
  private fileCache: Map<string, string> | null;

  constructor(reg: ToolRegistry, fileCache?: Map<string, string> | null) {
    this.reg = reg;
    this.fileCache = fileCache ?? null;
  }

  async observe(): Promise<ObservationResult> {
    const checks: Array<{ name: string; ok: boolean; output: string }> = [];

    // 0. Ensure dependencies are installed (sandbox FS — not Supabase project_files)
    try {
      const hasNodeModules = await this.sandboxPathExists("node_modules");
      const hasPackageJson = await this.sandboxPathExists("package.json");
      if (hasPackageJson && !hasNodeModules) {
        const install = await this.reg.execute({
          id: crypto.randomUUID(),
          name: "shell_exec",
          arguments: { command: "npm install 2>&1" },
        });
        const installOutput = stripAnsi(shellOutput(install));
        checks.push({ name: "install", ok: install.ok, output: installOutput.slice(0, 3000) });
        if (!install.ok) {
          return { passed: false, checks, feedback: `[install] ${installOutput.slice(0, 2000)}` };
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "install check falhou";
      checks.push({ name: "install", ok: false, output: msg });
      return { passed: false, checks, feedback: `[install] ${msg}` };
    }

    // 0.5. Design System — deep imports @forge/ui bloqueiam; demais violações são warnings
    const designCheck = await this.checkDesignSystem();
    checks.push({ name: "design-system", ok: designCheck.ok, output: designCheck.output });

    // 1. Build check
    try {
      const build = await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: { command: "npm run build 2>&1" },
      });
      const buildOutput = stripAnsi(shellOutput(build));
      const buildOk = build.ok && !outputIndicatesBuildFailure(buildOutput);
      checks.push({ name: "build", ok: buildOk, output: buildOutput.slice(0, 8000) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "build check falhou";
      checks.push({ name: "build", ok: false, output: msg });
    }

    // 2. TypeScript check (se existir tsconfig)
    const hasTs = await this.sandboxPathExists("tsconfig.json");
    if (hasTs) {
      try {
        const tsc = await this.reg.execute({
          id: crypto.randomUUID(),
          name: "shell_exec",
          arguments: { command: "npx tsc --noEmit --project tsconfig.json 2>&1 || true" },
        });
        const tscOutput = stripAnsi(shellOutput(tsc));
        const ok = !outputIndicatesBuildFailure(tscOutput);
        checks.push({ name: "typescript", ok, output: tscOutput.slice(0, 2000) });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "typescript check falhou";
        checks.push({ name: "typescript", ok: false, output: msg });
      }
    }

    // 3. Lint check (se existir eslint config)
    const hasLint =
      (await this.sandboxPathExists(".eslintrc")) ||
      (await this.sandboxPathExists(".eslintrc.json")) ||
      (await this.sandboxPathExists("eslint.config.js")) ||
      (await this.sandboxPathExists(".eslintrc.js"));
    if (hasLint) {
      try {
        const lint = await this.reg.execute({
          id: crypto.randomUUID(),
          name: "shell_exec",
          arguments: { command: "npm run lint 2>&1 || true" },
        });
        const lintOutput = stripAnsi(
          typeof lint.output === "object"
            ? ((lint.output as any).stderr ?? (lint.output as any).stdout ?? "")
            : String(lint.output ?? ""),
        );
        const lintOk = lint.ok && !outputIndicatesBuildFailure(lintOutput);
        checks.push({ name: "lint", ok: lintOk, output: lintOutput.slice(0, 2000) });
      } catch {
        checks.push({ name: "lint", ok: true, output: "(lint não disponível)" });
      }
    }

    // 4. Git status
    try {
      const git = await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: { command: "git status --short 2>&1 || true" },
      });
      const gitOutput =
        typeof git.output === "object"
          ? ((git.output as any).stdout ?? "")
          : String(git.output ?? "");
      checks.push({
        name: "git",
        ok: true,
        output: gitOutput.slice(0, 1000) || "(repositório limpo)",
      });
    } catch {
      checks.push({ name: "git", ok: true, output: "(git não disponível)" });
    }

    const failures = checks.filter((c) => !c.ok);
    let feedback: string | undefined;

    if (failures.length > 0) {
      feedback = failures.map((f) => `[${f.name}] ${f.output.slice(0, 4000)}`).join("\n\n");
    }

    return {
      passed: failures.length === 0,
      checks,
      feedback,
    };
  }

  /** Type-check incremental — roda tsc apenas nos arquivos modificados (rápido) */
  async quickTypeCheck(modifiedFiles: string[]): Promise<TypeCheckResult> {
    const hasTs = await this.sandboxPathExists("tsconfig.json");
    if (!hasTs || modifiedFiles.length === 0) {
      return { ok: true, errors: [], output: "" };
    }

    // Filtra apenas arquivos TypeScript/TSX
    const tsFiles = modifiedFiles.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    if (tsFiles.length === 0) {
      return { ok: true, errors: [], output: "" };
    }

    try {
      // tsc com --noEmit e lista de arquivos (mais rápido que projeto inteiro)
      const fileArgs = tsFiles.map((f) => `"${f}"`).join(" ");
      const tsc = await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: { command: `npx tsc --noEmit --project tsconfig.json ${fileArgs} 2>&1 || true` },
      });
      const tscOutput = shellOutput(tsc);

      const errors: TypeCheckResult["errors"] = [];
      if (outputIndicatesBuildFailure(tscOutput)) {
        // Parse simples de erros TypeScript
        for (const line of tscOutput.split("\n")) {
          const match = line.match(/^(.+\.(ts|tsx))\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
          if (match) {
            errors.push({
              file: match[1],
              line: parseInt(match[3], 10),
              column: parseInt(match[4], 10),
              code: match[5],
              message: match[6],
            });
          }
        }
      }

      return {
        ok: errors.length === 0 && !outputIndicatesBuildFailure(tscOutput),
        errors,
        output: tscOutput.slice(0, 2000),
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "quick type-check falhou";
      return { ok: false, errors: [], output: msg };
    }
  }

  /** Design System Check — sugestões NÃO bloqueantes (warnings apenas).
   *  Usa fileCache para evitar N+1 fs_read calls que poluem o context window. */
  async checkDesignSystem(): Promise<{ name: string; ok: boolean; output: string }> {
    const designViolations: DesignViolation[] = [];
    const fileContents = new Map<string, string>();

    try {
      // 1. Verifica @forge/ui no package.json (usa cache se disponível)
      let hasForgeUI = false;
      const pkgCached = this.fileCache?.get("package.json");
      if (pkgCached) {
        try {
          const pkgJson = JSON.parse(pkgCached);
          hasForgeUI =
            !!pkgJson.dependencies?.["@forge/ui"] || !!pkgJson.devDependencies?.["@forge/ui"];
        } catch {
          /* ignora parse error */
        }
      } else {
        const pkg = await this.reg.execute({
          id: crypto.randomUUID(),
          name: "fs_read",
          arguments: { path: "package.json" },
        });
        if (pkg.ok && pkg.output) {
          try {
            const pkgJson = JSON.parse(String(pkg.output));
            hasForgeUI =
              !!pkgJson.dependencies?.["@forge/ui"] || !!pkgJson.devDependencies?.["@forge/ui"];
          } catch {
            /* ignora parse error */
          }
        }
      }

      // 2. Scan apenas do cache de arquivos (sem fs_read extra)
      if (this.fileCache && this.fileCache.size > 0) {
        for (const [path, code] of this.fileCache) {
          if (!/\.(tsx|ts)$/.test(path)) continue;
          if (path.includes("node_modules")) continue;
          fileContents.set(path, code);
          designViolations.push(...scanFileForViolations(path, code));
        }
      }

      designViolations.push(...scanProjectForLandingQuality(fileContents));

      // 3. Verifica tokens @theme no CSS (usa cache ou grep como fallback)
      let hasThemeTokens = false;
      for (const [path, code] of this.fileCache ?? []) {
        if (path.endsWith(".css") && code.includes("@theme")) {
          hasThemeTokens = true;
          break;
        }
      }
      if (!hasThemeTokens && this.fileCache) {
        // Fallback: grep no sandbox
        try {
          const cssCheck = await this.reg.execute({
            id: crypto.randomUUID(),
            name: "shell_exec",
            arguments: { command: `grep -r "@theme" --include="*.css" . 2>/dev/null | head -5` },
          });
          hasThemeTokens =
            cssCheck.ok && !!cssCheck.output && String(cssCheck.output).trim().length > 0;
        } catch {
          /* best-effort */
        }
      }

      if (!hasForgeUI && fileContents.size > 0) {
        designViolations.unshift({
          file: "package.json",
          message:
            '@forge/ui não instalado — adicione "@forge/ui": "file:./packages/forge-ui" e dependências peer',
        });
      }
      if (!hasThemeTokens && fileContents.size > 0) {
        designViolations.unshift({
          file: "src/index.css",
          message:
            "Nenhum @theme encontrado — use forgeThemeBlock tokens (brand, surface, shadow-glow)",
        });
      }
    } catch {
      /* design check é best-effort — silencia erros */
    }

    const blocking = designViolations.filter((v) => v.message === INVALID_FORGE_UI_IMPORT_MESSAGE);
    return {
      name: "design-system",
      ok: blocking.length === 0,
      output: formatDesignFeedback(designViolations),
    };
  }

  /** Check path in sandbox filesystem (files or directories). */
  async sandboxPathExists(path: string): Promise<boolean> {
    const result = await this.reg.execute({
      id: crypto.randomUUID(),
      name: "shell_exec",
      arguments: { command: `test -e "${path.replace(/"/g, '\\"')}" && echo yes || echo no` },
    });
    const output =
      typeof result.output === "object"
        ? ((result.output as { stdout?: string }).stdout ?? "")
        : String(result.output ?? "");
    return output.trim().endsWith("yes");
  }
}
