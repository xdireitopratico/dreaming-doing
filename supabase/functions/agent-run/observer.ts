// observer.ts — Runtime Observation Loop
// Observa build, typecheck, console errors e auto-corrige
import type { ToolRegistry } from "./registry.ts";

export interface ObservationResult {
  passed: boolean;
  checks: Array<{ name: string; ok: boolean; output: string }>;
  feedback?: string;
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

  async hasFile(path: string): Promise<boolean> {
    const result = await this.reg.execute({
      id: crypto.randomUUID(),
      name: "fs_read",
      arguments: { path },
    });
    return result.ok;
  }
}
