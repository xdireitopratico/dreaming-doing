/** Secrets de deploy/CLI injetados no shell do sandbox E2B. */
export function buildSandboxEnv(
  connectorKeys: Record<string, string>,
  deployKeys: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const merge = { ...connectorKeys, ...deployKeys };
  for (const [k, v] of Object.entries(merge)) {
    if (v?.trim()) out[k] = v.trim();
  }
  return out;
}