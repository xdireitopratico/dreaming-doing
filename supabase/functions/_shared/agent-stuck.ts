/** Fingerprint de tool calls para detectar loop repetitivo (C19). */

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

/** Últimos 4 passos, ignorando fs_write/fs_edit, com hash idêntico => agente preso. */
export function isExecutionStuck(log: string[]): boolean {
  if (log.length < 4) return false;
  const last4 = log.slice(-4);
  return last4[0] === last4[1] && last4[1] === last4[2] && last4[2] === last4[3];
}