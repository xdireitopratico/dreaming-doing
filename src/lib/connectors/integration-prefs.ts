export type IntegrationMode = "forge" | "own";

export type ConnectorId = "github" | "supabase" | "vercel" | "netlify" | "cloudflare" | "e2b";

export type IntegrationPrefs = Record<ConnectorId, IntegrationMode>;

export const DEFAULT_INTEGRATION_PREFS: IntegrationPrefs = {
  github: "own",
  supabase: "own",
  vercel: "own",
  netlify: "own",
  cloudflare: "own",
  e2b: "own",
};

export const TRIAL_MESSAGES_DEFAULT = 50;

export function parseIntegrationPrefs(raw: unknown): IntegrationPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_INTEGRATION_PREFS };
  const o = raw as Record<string, unknown>;
  const out = { ...DEFAULT_INTEGRATION_PREFS };
  for (const key of Object.keys(DEFAULT_INTEGRATION_PREFS) as ConnectorId[]) {
    const v = o[key];
    if (v === "forge" || v === "own") out[key] = v;
  }
  return out;
}
