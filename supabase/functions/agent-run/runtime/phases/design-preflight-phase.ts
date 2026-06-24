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
  loopBudgetExceeded: () => boolean;
  gatherContext: () => Promise<void>;
  touchHeartbeat: () => Promise<void>;
  emit: (type: string, data: unknown) => void;
};

export async function runDesignPreflightIfNeeded(deps: DesignPreflightDeps): Promise<void> {
  if (deps.planMode || deps.smokeRun || !needsDesignPreflight(deps.projectTemplate)) return;
  if (deps.resumeRun && deps.touchedPaths.size > 0) return;
  if (deps.loopBudgetExceeded()) return;

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
    const failed = preflight.checks.filter((c) => !c.ok).map((c) => c.name).join(", ");
    deps.emit("validate_fail", {
      attempt: 0,
      checks: failed ? [failed] : ["preflight"],
      feedback: preflight.feedback?.slice(0, 500),
      preflight: true,
    });
    preflightErrors.push(`Design system: ${preflight.feedback?.slice(0, 500) ?? "erro"}`);
  }

  if (preflightErrors.length > 0) {
    deps.state.messages.push({
      role: "user",
      content: `PREFLIGHT FALHOU:\n${preflightErrors.join("\n")}\nCorrija antes de continuar.`,
    });
  }
}