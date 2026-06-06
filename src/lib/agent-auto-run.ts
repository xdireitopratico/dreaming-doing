/** Sinaliza que o editor deve iniciar o agente ao abrir (projeto recém-criado). */

const key = (projectId: string) => `forge:auto-run:${projectId}`;

export function markPendingAgentRun(projectId: string, conversationId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key(projectId), conversationId);
  } catch {
    /* quota / private mode */
  }
}

export function peekPendingAgentRun(projectId: string, conversationId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(key(projectId)) === conversationId;
  } catch {
    return false;
  }
}

export function clearPendingAgentRun(projectId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key(projectId));
  } catch {
    /* ignore */
  }
}