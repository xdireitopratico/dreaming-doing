import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NavigateOptions } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ChatMessage } from "@/lib/chat-types";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { collapseForgeUiBundle } from "@/lib/file-tree-display";
import { detectProjectStack, type ProjectStackKind } from "@/lib/detect-project-kind";
import type { useAgentRun } from "@/hooks/useAgentRun";
import { useAgentRealtime } from "@/hooks/useAgentRealtime";

import type { FileRow, Msg } from "./editor-page-types";

type AgentRun = ReturnType<typeof useAgentRun>;

type UseEditorPageDataParams = {
  projectId: string;
  search: { replay?: string };
  agent: AgentRun;
  navigate: (options: NavigateOptions) => void;
};

export function useEditorPageData({ projectId, search, agent, navigate }: UseEditorPageDataParams) {
  const qc = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
      return data as any;
    },
  });

  const { data: conversation } = useQuery({
    queryKey: ["conversation", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const {
    data: messages,
    isPending: messagesPending,
    isFetching: messagesFetching,
  } = useQuery({
    queryKey: ["messages", conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      return (data ?? []) as Msg[];
    },
    enabled: !!conversation,
  });

  /** Pós-F5: evita flash do welcome BYOK enquanto o histórico ainda não chegou do DB. */
  const chatMessagesLoading =
    !!conversation?.id && (messagesPending || (messagesFetching && messages === undefined));

  const { data: files } = useQuery({
    queryKey: ["files", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", projectId)
        .order("path");
      return (data ?? []) as FileRow[];
    },
  });

  // ─── Replay: se ?replay=runId veio da history page, dispara replay no mount ─────
  useEffect(() => {
    if (!search.replay) return;
    const runId = search.replay;
    const conv = conversation?.id;
    if (!conv) return;
    void agent.replay(projectId, conv, runId);
    navigate({ to: "/projects/$projectId", params: { projectId }, search: {} });
  }, [search.replay, conversation?.id, projectId, navigate, agent]);

  const isReactProject = useMemo(
    () => files?.some((f) => f.path === "package.json" || f.path === "/package.json") ?? false,
    [files],
  );

  const projectStack = useMemo((): ProjectStackKind | null => {
    if (!files?.length) return null;
    return detectProjectStack(files.map((f) => ({ path: f.path, content: f.content ?? "" })));
  }, [files]);

  /** Só substitui o iframe quando não há app web — projetos mistos mantêm preview Vite. */
  const nativeBuildPreview = useMemo(() => projectStack === "android-native", [projectStack]);

  const agentHasRun = useMemo(
    () => messages?.some((m) => m.role === "assistant") ?? false,
    [messages],
  );

  const devUrl = (project?.meta as { previewUrl?: string } | null)?.previewUrl ?? null;
  const projectMeta = (project?.meta as Record<string, unknown> | null) ?? null;
  const publishedUrl =
    typeof projectMeta?.publishedUrl === "string" ? projectMeta.publishedUrl : null;
  const previewReady = projectMeta?.previewReady === true;

  // ─── Realtime unificado (agent_runs + agent_stream_events + messages) ───
  useAgentRealtime(projectId, conversation?.id);

  // ─── Realtime project_files (canal editor-{projectId}) ───
  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel(`editor-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_files",
          filter: `project_id=eq.${projectId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["files", projectId] }),
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`[FORGE Realtime] editor-${projectId}`, status, err);
          logEditorTelemetryEvent(
            "realtime",
            status === "CHANNEL_ERROR" ? "channel_error" : "timed_out",
            "error",
            err?.message?.slice(0, 120),
          );
        }
        if (status === "SUBSCRIBED") {
          logEditorTelemetryEvent("realtime", "subscribed", "ok", projectId);
        }
      });
    return () => removeRealtimeChannel(channel);
  }, [projectId, qc]);

  // ─── Derivados ───────────────────────────────────────────────────────
  const filePaths = useMemo(() => files?.map((f) => f.path) ?? [], [files]);
  const fileMap = useMemo(() => {
    const map = new Map<string, string>();
    files?.forEach((f) => map.set(f.path, f.content ?? ""));
    return map;
  }, [files]);

  const chatMessages: ChatMessage[] = useMemo(() => {
    return (messages ?? []).map((m) => {
      const roleRaw = String(m.role ?? "").toLowerCase();
      const role: ChatMessage["role"] =
        roleRaw === "user" ? "user" : roleRaw === "assistant" ? "assistant" : "tool";
      const meta = m.meta ?? null;
      const runId = meta && typeof meta.runId === "string" ? meta.runId : undefined;
      return {
        id: m.id,
        role,
        content: m.parts?.map((p: any) => p.text).join("\n") ?? "",
        toolCalls:
          m.tool_calls?.map((t: any) => ({ name: t.name, args: t.args?.path ?? "" })) ?? [],
        meta,
        runId,
        timestamp: new Date(m.created_at).getTime(),
      };
    });
  }, [messages]);

  const fileTreeFiles = useMemo(
    () => collapseForgeUiBundle(files?.map((f) => f.path) ?? []),
    [files],
  );

  const previewNavFiles = useMemo(() => {
    if (files && files.length > 0) {
      return files.map((f) => ({ path: f.path, content: f.content ?? "" }));
    }
    return fileTreeFiles.map((path) => ({ path, content: "" }));
  }, [files, fileTreeFiles]);

  return {
    qc,
    project,
    conversation,
    messages,
    files,
    filePaths,
    fileMap,
    chatMessages,
    chatMessagesLoading,
    fileTreeFiles,
    previewNavFiles,
    isReactProject,
    projectStack,
    nativeBuildPreview,
    agentHasRun,
    devUrl,
    projectMeta,
    publishedUrl,
    previewReady,
  };
}
