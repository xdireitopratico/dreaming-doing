// runtime/phases/design-preflight-phase.ts — Preflight de design antes do build (Fase 2.2)
import {
  auditDesignInventory,
  needsDesignPreflight,
  runDesignPreflight,
} from "../../design-preflight.ts";
import type { AgentState } from "../../types.ts";
import type { ToolRegistry } from "../../registry.ts";

export type DesignPreflightDeps = {
  planMode: boolean;
  smokeRun?: boolean;
  projectTemplate: string;
  resumeRun: boolean;
  touchedPaths: Set<string>;
  state: AgentState;
  reg: ToolRegistry;
  platformLimitExceeded: () => boolean;
  gatherContext: () => Promise<void>;
  touchHeartbeat: () => Promise<void>;
  emit: (type: string, data: unknown) => void;
};

export type DesignPreflightOutcome = {
  status: "passed" | "recoverable_fail" | "terminal_fail";
  feedback?: string;
  checks: Array<{ name: string; ok: boolean; output: string }>;
  availableComponents?: string;
};

export async function runDesignPreflightIfNeeded(
  deps: DesignPreflightDeps,
): Promise<DesignPreflightOutcome | null> {
  if (deps.planMode || deps.smokeRun || !needsDesignPreflight(deps.projectTemplate)) return null;
  if (deps.resumeRun && deps.touchedPaths.size > 0) return null;
  if (deps.platformLimitExceeded()) return null;

  if (!deps.state.context?.files?.length) {
    await deps.gatherContext();
  }

  const files = deps.state.context?.files ?? [];
  const inventory = auditDesignInventory(files);
  const preflightErrors: string[] = [];
  if (!inventory.ok) preflightErrors.push(`Faltam: ${inventory.missing.join(", ")}`);
  if (inventory.warnings.length > 0) {
    preflightErrors.push(`Imports: ${inventory.warnings.slice(0, 3).join(", ")}`);
  }

  await deps.touchHeartbeat();
  deps.emit("phase", { phase: "preflight", message: "Executando..." });

  const preflight = await runDesignPreflight(deps.reg);
  const manifest = preflight.availableComponents;
  if (deps.state.context) {
    deps.state.context.projectConfig += `\n\n## Design System (@forge/ui)\n${manifest}`;
  }

  if (!preflight.passed) {
    preflightErrors.push(`Design system: ${preflight.feedback?.slice(0, 500) ?? "erro"}`);
  }

  const hasContractFailure = inventory.missing.length > 0;
  const hasRecoverableFailure = !preflight.passed;
  const status =
    preflightErrors.length === 0
      ? "passed"
      : hasContractFailure
        ? "terminal_fail"
        : hasRecoverableFailure
          ? "recoverable_fail"
          : "terminal_fail";

  return {
    status,
    feedback:
      preflightErrors.length > 0
        ? `PREFLIGHT FALHOU:\n${preflightErrors.join("\n")}`
        : undefined,
    checks: [
      ...preflight.checks,
      ...(inventory.missing.length > 0 || inventory.warnings.length > 0
        ? [
            {
              name: "inventory",
              ok: inventory.ok,
              output: [
                inventory.missing.length > 0 ? `Faltam: ${inventory.missing.join(", ")}` : null,
                inventory.warnings.length > 0 ? `Imports: ${inventory.warnings.slice(0, 3).join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" | "),
            },
          ]
        : []),
    ],
    availableComponents: manifest,
  };
}
