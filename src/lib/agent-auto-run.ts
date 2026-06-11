/** Sinaliza que o editor deve iniciar o agente ao abrir (projeto recém-criado). */

const flagKey = (projectId: string) => `forge:auto-run:${projectId}`;
const attemptedKey = (projectId: string, conversationId: string) =>
  `forge:auto-run-attempted:${projectId}:${conversationId}`;

export function markPendingAgentRun(projectId: string, conversationId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(flagKey(projectId), conversationId);
  } catch {
    /* quota / private mode */
  }
}

export function peekPendingAgentRun(projectId: string, conversationId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(flagKey(projectId)) === conversationId;
  } catch {
    return false;
  }
}

export function clearPendingAgentRun(projectId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(flagKey(projectId));
  } catch {
    /* ignore */
  }
}

/** Evita re-disparar auto-run no F5/remount para o mesmo projeto. */
export function hasAutoRunAttempted(projectId: string, conversationId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(attemptedKey(projectId, conversationId)) === "1";
  } catch {
    return false;
  }
}

export function markAutoRunAttempted(projectId: string, conversationId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(attemptedKey(projectId, conversationId), "1");
  } catch {
    /* ignore */
  }
}
