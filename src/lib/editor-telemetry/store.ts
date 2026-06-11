import { buildShotHeadline, partitionSignals, qualifySnapshot } from "./qualify";
import type {
  EditorTelemetrySnapshot,
  TelemetryEvent,
  TelemetryLevel,
  TroubleshootingShot,
} from "./types";

const MAX_EVENTS = 400;
const DEDUPE_MS = 1200;
const SCHEMA_VERSION = 1 as const;

const sessionId =
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}`;

let snapshot: EditorTelemetrySnapshot = emptySnapshot();
let events: TelemetryEvent[] = [];
const listeners = new Set<() => void>();
let lastEventKey = "";
let lastEventAt = 0;

function emptySnapshot(): EditorTelemetrySnapshot {
  return {
    projectId: null,
    projectName: null,
    auth: { signedIn: false, userId: null, email: null },
    env: {
      supabaseConfigured: false,
      supabaseUrl: null,
      projectRefOk: false,
      missingEnv: [],
    },
    connectors: {
      e2bConnected: false,
      hasUserLlmKey: false,
      tasteChatRemaining: 0,
      tasteStartRemaining: 0,
      connectedKinds: [],
    },
    agent: {
      preferencesConfigured: false,
      mode: null,
      running: false,
      agentConnected: false,
      phase: null,
      lastError: null,
      finished: false,
      resumable: false,
      sessionKindResolved: null,
      toolCount: 0,
    },
    preview: {
      devUrl: null,
      booting: false,
      lastBootError: null,
      warming: false,
      isReactProject: false,
      agentHasRun: false,
      activeView: "preview",
    },
    sandbox: {
      previewSandboxId: null,
      previewReady: null,
      previewExpiresAt: null,
    },
    project: { fileCount: 0, messageCount: 0, hasPackageJson: false },
    realtime: { conversationId: null },
  };
}

function notify() {
  listeners.forEach((fn) => fn());
}

function mergeSnapshot(patch: Partial<EditorTelemetrySnapshot>): void {
  snapshot = {
    ...snapshot,
    ...patch,
    auth: { ...snapshot.auth, ...patch.auth },
    env: { ...snapshot.env, ...patch.env },
    connectors: { ...snapshot.connectors, ...patch.connectors },
    agent: { ...snapshot.agent, ...patch.agent },
    preview: { ...snapshot.preview, ...patch.preview },
    sandbox: { ...snapshot.sandbox, ...patch.sandbox },
    project: { ...snapshot.project, ...patch.project },
    realtime: { ...snapshot.realtime, ...patch.realtime },
  };
}

export function getEditorTelemetrySessionId(): string {
  return sessionId;
}

export function patchEditorTelemetrySnapshot(patch: Partial<EditorTelemetrySnapshot>): void {
  mergeSnapshot(patch);
  notify();
}

export function logEditorTelemetryEvent(
  category: TelemetryEvent["category"],
  action: string,
  level: TelemetryLevel = "info",
  detail?: string,
): void {
  const now = Date.now();
  const key = `${category}|${action}|${level}|${detail ?? ""}`;
  if (key === lastEventKey && now - lastEventAt < DEDUPE_MS) return;
  lastEventKey = key;
  lastEventAt = now;

  events = [...events.slice(-(MAX_EVENTS - 1)), { ts: now, category, action, level, detail }];
  notify();
}

export function buildTroubleshootingShot(): TroubleshootingShot {
  const { signals, health, score } = qualifySnapshot(snapshot);
  const snap = JSON.parse(JSON.stringify(snapshot)) as EditorTelemetrySnapshot;
  const { blockers, warnings } = partitionSignals(signals);
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId,
    capturedAt: new Date().toISOString(),
    health,
    score,
    headline: buildShotHeadline(health, score, signals, snap),
    blockers,
    warnings,
    signals,
    snapshot: snap,
    recentEvents: [...events],
  };
}

export function getTroubleshootingShot(): TroubleshootingShot {
  return buildTroubleshootingShot();
}

export function subscribeEditorTelemetry(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function exposeDevTelemetryApi(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __FORGE_TELEMETRY__?: Record<string, unknown> };
  w.__FORGE_TELEMETRY__ = {
    getShot: getTroubleshootingShot,
    log: logEditorTelemetryEvent,
    patch: patchEditorTelemetrySnapshot,
    sessionId: getEditorTelemetrySessionId,
  };
}

export function formatShotForClipboard(shot: TroubleshootingShot): string {
  const lines: string[] = [
    `# FORGE Troubleshooting Shot`,
    `captured: ${shot.capturedAt}`,
    `session: ${shot.sessionId}`,
    `health: ${shot.health} (score ${shot.score}/100)`,
    `headline: ${shot.headline}`,
    `project: ${shot.snapshot.projectId ?? "—"} ${shot.snapshot.projectName ?? ""}`,
    ``,
    ...(shot.blockers.length > 0
      ? [`## Blockers`, ...shot.blockers.map((s) => `- ${s.message}`), ``]
      : []),
    ...(shot.warnings.length > 0
      ? [`## Warnings`, ...shot.warnings.map((s) => `- ${s.message}`), ``]
      : []),
    `## Signals`,
    ...shot.signals.map(
      (s) => `- [${s.level}] ${s.category}: ${s.message}${s.hint ? ` → ${s.hint}` : ""}`,
    ),
    ``,
    `## Recent events (last ${shot.recentEvents.length})`,
    ...shot.recentEvents.slice(-25).map((e) => {
      const t = new Date(e.ts).toISOString().slice(11, 23);
      return `${t} [${e.level}] ${e.category}/${e.action}${e.detail ? `: ${e.detail}` : ""}`;
    }),
    ``,
    `## JSON`,
    JSON.stringify(shot, null, 2),
  ];
  return lines.join("\n");
}

/** Erros globais não capturados pelo React. */
export function installEditorTelemetryGlobalHandlers(): void {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __forgeTelemetryInstalled?: boolean }).__forgeTelemetryInstalled) {
    return;
  }
  (window as unknown as { __forgeTelemetryInstalled?: boolean }).__forgeTelemetryInstalled = true;
  exposeDevTelemetryApi();

  window.addEventListener("error", (ev) => {
    logEditorTelemetryEvent("ui", "uncaught_error", "error", ev.message?.slice(0, 200));
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const msg =
      ev.reason instanceof Error
        ? ev.reason.message
        : typeof ev.reason === "string"
          ? ev.reason
          : "unhandled rejection";
    logEditorTelemetryEvent("ui", "unhandled_rejection", "error", msg.slice(0, 200));
  });
}

exposeDevTelemetryApi();
