/** Página de erro da E2B quando o sandbox expirou ou foi removido (responde HTTP 200). */
export function isStaleE2bPreviewBody(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("sandbox not found") ||
    lower.includes("wasn't found") ||
    lower.includes("wasn&#39;t found") ||
    lower.includes("sandbox wasn't found")
  );
}

export function isStaleE2bPreviewError(message: string, code?: string): boolean {
  if (code === "e2b_sandbox_stale") return true;
  const lower = message.toLowerCase();
  return lower.includes("sandbox not found") || lower.includes("wasn't found");
}

export const STALE_SANDBOX_USER_MESSAGE =
  "O ambiente E2B expirou. Reconectando o preview…";