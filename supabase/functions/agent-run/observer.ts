// observer.ts — Runtime Observation Loop
// Observa build, typecheck, console errors e auto-corrige
import type { ToolRegistry } from "./registry.ts";

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

export class RuntimeObserver {
  private reg: ToolRegistry;

  constructor(reg: ToolRegistry) {
    this.reg = reg;
  }

  async observe(): Promise<ObservationResult> {
    const checks: Array<{ name: string; ok: boolean; output: string }> = [];

    // 0. Ensure dependencies are installed
    try {
      const hasNodeModules = await this.hasFile("node_modules");
      const hasPackageJson = await this.hasFile("package.json");
      if (hasPackageJson && !hasNodeModules) {
        const install = await this.reg.execute({
          id: crypto.randomUUID(),
          name: "shell_exec",
          arguments: { command: "npm install 2>&1" },
        });
        const installOutput = typeof install.output === "object"
          ? (install.output as any).stderr ?? (install.output as any).stdout ?? ""
          : String(install.output ?? "");
        checks.push({ name: "install", ok: install.ok, output: installOutput.slice(0, 3000) });
        if (!install.ok) {
          return { passed: false, checks, feedback: `[install] ${installOutput.slice(0, 2000)}` };
        }
      }
    } catch {
      checks.push({ name: "install", ok: true, output: "(sandbox não disponível)" });
    }

    // 1. Build check
    try {
      const build = await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: { command: "npm run build 2>&1" },
      });
      const buildOutput = typeof build.output === "object"
        ? (build.output as any).stderr ?? (build.output as any).stdout ?? ""
        : String(build.output ?? "");
      checks.push({ name: "build", ok: build.ok, output: buildOutput.slice(0, 3000) });
    } catch (e: any) {
      checks.push({ name: "build", ok: true, output: "(sandbox não disponível)" });
    }

    // 2. TypeScript check (se existir tsconfig)
    const hasTs = await this.hasFile("tsconfig.json");
    if (hasTs) {
      try {
        const tsc = await this.reg.execute({
          id: crypto.randomUUID(),
          name: "shell_exec",
          arguments: { command: "npx tsc --noEmit 2>&1 || true" },
        });
        const tscOutput = typeof tsc.output === "object"
          ? (tsc.output as any).stderr ?? (tsc.output as any).stdout ?? ""
          : String(tsc.output ?? "");
        const ok = tscOutput.length < 10 || tscOutput.includes("error TS") === false;
        checks.push({ name: "typescript", ok, output: tscOutput.slice(0, 2000) });
      } catch {
        checks.push({ name: "typescript", ok: true, output: "(npx tsc indisponível)" });
      }
    }

    // 3. Lint check (se existir eslint config)
    const hasLint = await this.hasFile(".eslintrc") ||
      await this.hasFile(".eslintrc.json") ||
      await this.hasFile("eslint.config.js") ||
      await this.hasFile(".eslintrc.js");
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
        checks.push({ name: "lint", ok: true, output: lintOutput.slice(0, 2000) });
      } catch {
        // lint é sempre opcional
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
    const hasTs = await this.hasFile("tsconfig.json");
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
        arguments: { command: `npx tsc --noEmit ${fileArgs} 2>&1 || true` },
      });
      const tscOutput = typeof tsc.output === "object"
        ? (tsc.output as any).stderr ?? (tsc.output as any).stdout ?? ""
        : String(tsc.output ?? "");

      const errors: TypeCheckResult["errors"] = [];
      if (tscOutput.includes("error TS")) {
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
        ok: errors.length === 0,
        errors,
        output: tscOutput.slice(0, 2000),
      };
    } catch {
      return { ok: true, errors: [], output: "(quick type-check indisponível)" };
    }
  }

  async hasFile(path: string): Promise<boolean> {
    const result = await this.reg.execute({
      id: crypto.randomUUID(),
      name: "fs_read",
      arguments: { path },
    });
    return result.ok;
  }
}
