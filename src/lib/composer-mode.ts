import type { AgentComposerMode } from "@/lib/chat-types";

const DEFAULT_MODE: AgentComposerMode = "plan";

function projectKey(projectId: string): string {
  return `forge:composer-mode:${projectId}`;
}

function bootstrapKey(projectId: string): string {
  return `forge:composer-mode-bootstrap:${projectId}`;
}

function storageAvailable(): boolean {
  return typeof localStorage !== "undefined" && typeof sessionStorage !== "undefined";
}

/** Modo escolhido pelo usuário — persiste por projeto (localStorage). */
export function loadComposerMode(projectId: string): AgentComposerMode {
  if (!storageAvailable()) return DEFAULT_MODE;
  try {
    const saved = localStorage.getItem(projectKey(projectId));
    if (saved === "plan" || saved === "build") return saved;

    const bootstrap = sessionStorage.getItem(bootstrapKey(projectId));
    if (bootstrap === "plan" || bootstrap === "build") {
      sessionStorage.removeItem(bootstrapKey(projectId));
      localStorage.setItem(projectKey(projectId), bootstrap);
      return bootstrap;
    }
  } catch {
    /* ignore quota / private mode */
  }
  return DEFAULT_MODE;
}

export function saveComposerMode(projectId: string, mode: AgentComposerMode): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(projectKey(projectId), mode);
  } catch {
    /* ignore */
  }
}

/** Primeiro prompt (home/dashboard) — sistema pré-seleciona Plan uma vez. */
export function bootstrapComposerMode(
  projectId: string,
  mode: AgentComposerMode = DEFAULT_MODE,
): void {
  if (!storageAvailable()) return;
  try {
    if (localStorage.getItem(projectKey(projectId))) return;
    sessionStorage.setItem(bootstrapKey(projectId), mode);
  } catch {
    /* ignore */
  }
}