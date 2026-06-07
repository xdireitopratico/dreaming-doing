import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";
import { resolveSessionKind } from "@/lib/taste";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { FORGE_SUPABASE_PROJECT_REF } from "@/lib/forge-supabase";
import {
  installEditorTelemetryGlobalHandlers,
  logEditorTelemetryEvent,
  patchEditorTelemetrySnapshot,
} from "@/lib/editor-telemetry";
import type { AgentProgress } from "@/lib/agent-progress";
import type { ForgeSessionKind } from "@/lib/taste";

export type EditorTelemetryInput = {
  projectId: string;
  projectName?: string | null;
  projectMeta?: Record<string, unknown> | null;
  conversationId?: string | null;
  e2bConnected: boolean;
  hasUserLlmKey: boolean;
  tasteChatRemaining: number;
  tasteStartRemaining: number;
  connectedKinds: string[];
  running: boolean;
  agentConnected: boolean;
  agentProgress: AgentProgress;
  devUrl: string | null;
  previewBooting: boolean;
  previewLastError: string | null;
  previewWarming: boolean;
  isReactProject: boolean;
  agentHasRun: boolean;
  activeView: string;
  fileCount: number;
  messageCount: number;
  hasPackageJson: boolean;
  sessionKindHint?: ForgeSessionKind;
};

export function useEditorTelemetry(input: EditorTelemetryInput | null): void {
  const { user } = useAuth();
  const prevError = useRef<string | null>(null);
  const prevBootError = useRef<string | null>(null);

  useEffect(() => {
    installEditorTelemetryGlobalHandlers();
    logEditorTelemetryEvent("ui", "editor_mount", "info", input?.projectId);
  }, [input?.projectId]);

  useEffect(() => {
    if (!input) return;

    const env = getSupabaseEnv();
    const prefs = loadAgentPreferences();
    const tasteQuota = {
      tasteChatRemaining: input.tasteChatRemaining,
      tasteStartRemaining: input.tasteStartRemaining,
      hasUserLlmKey: input.hasUserLlmKey,
    };
    const meta = input.projectMeta ?? {};
    const sessionResolved = input.sessionKindHint ?? resolveSessionKind(tasteQuota);

    patchEditorTelemetrySnapshot({
      projectId: input.projectId,
      projectName: input.projectName ?? null,
      auth: {
        signedIn: !!user,
        userId: user?.id ?? null,
        email: user?.email ?? null,
      },
      env: {
        supabaseConfigured: env.isConfigured,
        supabaseUrl: env.url ?? null,
        projectRefOk: env.url?.includes(FORGE_SUPABASE_PROJECT_REF) ?? false,
        missingEnv: env.missing,
      },
      connectors: {
        e2bConnected: input.e2bConnected,
        hasUserLlmKey: input.hasUserLlmKey,
        tasteChatRemaining: input.tasteChatRemaining,
        tasteStartRemaining: input.tasteStartRemaining,
        connectedKinds: input.connectedKinds,
      },
      agent: {
        preferencesConfigured: isAgentPreferencesConfigured(prefs),
        mode: prefs.mode ?? null,
        running: input.running,
        agentConnected: input.agentConnected,
        phase: input.agentProgress.phase,
        lastError: input.agentProgress.error,
        finished: input.agentProgress.finished,
        resumable: input.agentProgress.resumable,
        sessionKindResolved: sessionResolved,
        toolCount: input.agentProgress.tools.length,
      },
      preview: {
        devUrl: input.devUrl,
        booting: input.previewBooting,
        lastBootError: input.previewLastError,
        warming: input.previewWarming,
        isReactProject: input.isReactProject,
        agentHasRun: input.agentHasRun,
        activeView: input.activeView,
      },
      sandbox: {
        previewSandboxId:
          typeof meta.previewSandboxId === "string" ? meta.previewSandboxId : null,
        previewReady:
          typeof meta.previewReady === "boolean" ? meta.previewReady : null,
        previewExpiresAt:
          typeof meta.previewExpiresAt === "string" ? meta.previewExpiresAt : null,
      },
      project: {
        fileCount: input.fileCount,
        messageCount: input.messageCount,
        hasPackageJson: input.hasPackageJson,
      },
      realtime: { conversationId: input.conversationId ?? null },
    });

    const err = input.agentProgress.error;
    if (err && err !== prevError.current) {
      prevError.current = err;
      logEditorTelemetryEvent("agent", "agent_error", "error", err.slice(0, 240));
    }
    if (!err) prevError.current = null;

    const bootErr = input.previewLastError;
    if (bootErr && bootErr !== prevBootError.current) {
      prevBootError.current = bootErr;
      logEditorTelemetryEvent("preview", "boot_error", "error", bootErr.slice(0, 240));
    }
    if (!bootErr) prevBootError.current = null;
  }, [input, user]);
}