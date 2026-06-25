// design-telemetry.ts — Métricas de craft para observer e execution log.
export type DesignTelemetryEvent = {
  kind: "read_paths_gate" | "design_validate" | "plan_design_field" | "design_resolve" | "design_fidelity" | "design_uniqueness";
  ok: boolean;
  detail?: string;
  at: string;
};

export function designTelemetryEntry(
  kind: DesignTelemetryEvent["kind"],
  ok: boolean,
  detail?: string,
): string {
  const payload: DesignTelemetryEvent = {
    kind,
    ok,
    detail: detail?.slice(0, 400),
    at: new Date().toISOString(),
  };
  return `[design-telemetry] ${JSON.stringify(payload)}`;
}

export function appendDesignTelemetry(
  log: string[],
  kind: DesignTelemetryEvent["kind"],
  ok: boolean,
  detail?: string,
): string[] {
  return [...log, designTelemetryEntry(kind, ok, detail)];
}