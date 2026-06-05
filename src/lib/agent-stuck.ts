/** Espelho testável de supabase/functions/_shared/agent-stuck.ts (C19). */

export function stableToolArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  return keys.map((k) => `${k}:${JSON.stringify(args[k])}`).join("|");
}

export function hashToolStep(name: string, args: Record<string, unknown>): string {
  return `${name}#${stableToolArgs(args)}`;
}

export function hashToolBatch(
  calls: Array<{ name: string; arguments: Record<string, unknown> }>,
): string {
  return calls.map((c) => hashToolStep(c.name, c.arguments)).join(";");
}

export function isExecutionStuck(log: string[]): boolean {
  if (log.length < 3) return false;
  const last3 = log.slice(-3);
  return last3[0] === last3[1] && last3[1] === last3[2];
}