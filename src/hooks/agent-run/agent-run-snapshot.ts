import type { AgentProgress } from "@/lib/agent-progress";

export const SESSION_STORAGE_KEY = "forge:agent-snapshot";
export const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;

export type AgentSnapshot = {
  projectId?: string;
  conversationId?: string;
  activeRunId: string | null;
  lastSeq: number;
  progress: AgentProgress;
  timestamp: number;
};

export type AgentSnapshotInput = Omit<AgentSnapshot, "timestamp">;

export function saveAgentSnapshot(snapshot: AgentSnapshotInput): void {
  try {
    const payload = JSON.stringify({ ...snapshot, timestamp: Date.now() });
    sessionStorage.setItem(SESSION_STORAGE_KEY, payload);
  } catch {
    // ignore quota exceeded
  }
}

export function loadAgentSnapshot(): AgentSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentSnapshot;
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAgentSnapshot(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}