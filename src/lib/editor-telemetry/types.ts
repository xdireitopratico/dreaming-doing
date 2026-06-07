/** Telemetria ao vivo do editor FORGE — troubleshooting shot. */

export type TelemetryLevel = "ok" | "warn" | "error" | "info";

export type TelemetryCategory =
  | "auth"
  | "env"
  | "connectors"
  | "agent"
  | "preview"
  | "sandbox"
  | "realtime"
  | "network"
  | "ui"
  | "sse";

export type EditorHealth = "healthy" | "degraded" | "critical";

export type TelemetrySignal = {
  id: string;
  level: TelemetryLevel;
  category: TelemetryCategory;
  message: string;
  hint?: string;
};

export type TelemetryEvent = {
  ts: number;
  category: TelemetryCategory | string;
  action: string;
  level: TelemetryLevel;
  detail?: string;
};

export type EditorTelemetrySnapshot = {
  projectId: string | null;
  projectName: string | null;
  auth: {
    signedIn: boolean;
    userId: string | null;
    email: string | null;
  };
  env: {
    supabaseConfigured: boolean;
    supabaseUrl: string | null;
    projectRefOk: boolean;
    missingEnv: string[];
  };
  connectors: {
    e2bConnected: boolean;
    hasUserLlmKey: boolean;
    tasteChatRemaining: number;
    tasteStartRemaining: number;
    connectedKinds: string[];
  };
  agent: {
    preferencesConfigured: boolean;
    mode: string | null;
    running: boolean;
    agentConnected: boolean;
    phase: string | null;
    lastError: string | null;
    finished: boolean;
    resumable: boolean;
    sessionKindResolved: string | null;
    toolCount: number;
  };
  preview: {
    devUrl: string | null;
    booting: boolean;
    lastBootError: string | null;
    warming: boolean;
    isReactProject: boolean;
    agentHasRun: boolean;
    activeView: string;
  };
  sandbox: {
    previewSandboxId: string | null;
    previewReady: boolean | null;
    previewExpiresAt: string | null;
  };
  project: {
    fileCount: number;
    messageCount: number;
    hasPackageJson: boolean;
  };
  realtime: {
    conversationId: string | null;
  };
};

export type TroubleshootingShot = {
  schemaVersion: 1;
  sessionId: string;
  capturedAt: string;
  health: EditorHealth;
  score: number;
  /** Resumo em uma linha para suporte / Slack */
  headline: string;
  blockers: TelemetrySignal[];
  warnings: TelemetrySignal[];
  signals: TelemetrySignal[];
  snapshot: EditorTelemetrySnapshot;
  recentEvents: TelemetryEvent[];
};