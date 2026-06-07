/** Valida chamadas service-role (sb_secret ou JWT legacy). */
export function isServiceRoleRequest(token: string, configuredKey: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (configuredKey && t === configuredKey) return true;

  const parts = t.split(".");
  if (parts.length !== 3) return false;

  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64)) as { role?: string; iss?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}