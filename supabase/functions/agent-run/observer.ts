// observer.ts — Runtime Observation Loop
// Observa build, typecheck, console errors e auto-corrige
import type { ToolRegistry } from "./registry.ts";
import {
  formatDesignFeedback,
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
  return typeof result.output === "object"
    ? (result.output as { stderr?: string; stdout?: string }).stderr ??
      (result.output as { stderr?: string; stdout?: string }).stdout ?? ""
    : String(result.output ?? "");
}

export class RuntimeObserver {
  private reg: ToolRegistry;

  constructor(reg: ToolRegistry) {
    this.reg = reg;
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
        const installOutput = shellOutput(install);
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

    // 0.5. Design System Check — enforça @forge/ui + tokens
    const designCheck = await this.checkDesignSystem();
    checks.push(designCheck);
    if (!designCheck.ok) {
      return { passed: false, checks, feedback: `[design-system] ${designCheck.output}` };
    }

    // 1. Build check
    try {
      const build = await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: { command: "npm run build 2>&1" },
      });
      const buildOutput = shellOutput(build);
      const buildOk = build.ok && !outputIndicatesBuildFailure(buildOutput);
      checks.push({ name: "build", ok: buildOk, output: buildOutput.slice(0, 3000) });
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
        const tscOutput = shellOutput(tsc);
        const ok = !outputIndicatesBuildFailure(tscOutput);
        checks.push({ name: "typescript", ok, output: tscOutput.slice(0, 2000) });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "typescript check falhou";
        checks.push({ name: "typescript", ok: false, output: msg });
      }
    }

    // 3. Lint check (se existir eslint config)
    const hasLint = await this.sandboxPathExists(".eslintrc") ||
      await this.sandboxPathExists(".eslintrc.json") ||
      await this.sandboxPathExists("eslint.config.js") ||
      await this.sandboxPathExists(".eslintrc.js");
    if (hasLint) {
      try {
        const lint = await this.reg.execute({
          id: crypto.randomUUID(),
          name: "shell_exec",
          arguments: { command: "npm run lint 2>&1 || true" },
        });
        const lintOutput = typeof lint.output === "object"
          ? (lint.output as any).stderr ?? (lint.output as any).stdout ?? ""
          : String(lint.output ?? "");
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
      const gitOutput = typeof git.output === "object"
        ? (git.output as any).stdout ?? ""
        : String(git.output ?? "");
      checks.push({ name: "git", ok: true, output: gitOutput.slice(0, 1000) || "(repositório limpo)" });
    } catch {
      checks.push({ name: "git", ok: true, output: "(git não disponível)" });
    }

    const failures = checks.filter(c => !c.ok);
    let feedback: string | undefined;

    if (failures.length > 0) {
      feedback = failures
        .map(f => `[${f.name}] ${f.output.slice(0, 1500)}`)
        .join("\n\n");
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
    const tsFiles = modifiedFiles.filter(f => f.endsWith(".ts") || f.endsWith(".tsx"));
    if (tsFiles.length === 0) {
      return { ok: true, errors: [], output: "" };
    }

    try {
      // tsc com --noEmit e lista de arquivos (mais rápido que projeto inteiro)
      const fileArgs = tsFiles.map(f => `"${f}"`).join(" ");
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

  /** Design System Check — valida uso de @forge/ui + tokens @theme */
  async checkDesignSystem(): Promise<{ name: string; ok: boolean; output: string }> {
    try {
      // 1. Verifica se @forge/ui está instalado
      const pkg = await this.reg.execute({
        id: crypto.randomUUID(),
        name: "fs_read",
        arguments: { path: "package.json" },
      });
      let hasForgeUI = false;
      if (pkg.ok && pkg.output) {
        const pkgJson = JSON.parse(String(pkg.output));
        hasForgeUI = !!pkgJson.dependencies?.["@forge/ui"] || !!pkgJson.devDependencies?.["@forge/ui"];
      }

      // 2. Scan arquivos .tsx/.ts para violações
      const scan = await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: {
          command: `find . -type f \\( -name "*.tsx" -o -name "*.ts" \\) ! -path "*/node_modules/*" ! -path "*/.git/*" 2>/dev/null | head -50`,
        },
      });

      const designViolations: DesignViolation[] = [];
      const fileContents = new Map<string, string>();

      if (scan.ok && scan.output) {
        const files = String(scan.output).trim().split("\n").filter(Boolean);
        for (const file of files.slice(0, 40)) {
          const normalized = file.replace("./", "");
          const content = await this.reg.execute({
            id: crypto.randomUUID(),
            name: "fs_read",
            arguments: { path: normalized },
          });
          if (!content.ok || !content.output) continue;
          const code = String(content.output);
          fileContents.set(normalized, code);
          designViolations.push(...scanFileForViolations(normalized, code));
        }
      }

      designViolations.push(...scanProjectForLandingQuality(fileContents));

      // 3. Verifica tokens @theme no CSS
      const cssCheck = await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: { command: `grep -r "@theme" --include="*.css" . 2>/dev/null | head -5` },
      });
      const hasThemeTokens = cssCheck.ok && cssCheck.output && String(cssCheck.output).trim().length > 0;

      if (!hasForgeUI) {
        designViolations.unshift({
          file: "package.json",
          message: "@forge/ui não instalado — adicione \"@forge/ui\": \"file:./packages/forge-ui\" e dependências peer",
        });
      }
      if (!hasThemeTokens) {
        designViolations.unshift({
          file: "src/index.css",
          message: "Nenhum @theme encontrado — use forgeThemeBlock tokens (brand, surface, shadow-glow)",
        });
      }

      if (designViolations.length > 0) {
        return {
          name: "design-system",
          ok: false,
          output: formatDesignFeedback(designViolations),
        };
      }

      return { name: "design-system", ok: true, output: formatDesignFeedback([]) };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "design-system check falhou";
      return { name: "design-system", ok: false, output: msg };
    }
  }

  /** Check path in sandbox filesystem (files or directories). */
  async sandboxPathExists(path: string): Promise<boolean> {
    const result = await this.reg.execute({
      id: crypto.randomUUID(),
      name: "shell_exec",
      arguments: { command: `test -e "${path.replace(/"/g, '\\"')}" && echo yes || echo no` },
    });
    const output = typeof result.output === "object"
      ? (result.output as { stdout?: string }).stdout ?? ""
      : String(result.output ?? "");
    return output.trim().endsWith("yes");
  }
}
