// history.tsx — Timeline visual de mudanças do agente
// Rota: /projects/$projectId/history
// Mostra diff por mensagem, scrubber horizontal, timeline de decisões
import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { EditorShell } from "@/components/EditorShell";
import { CodeEditor, type Tab } from "@/components/editor/CodeEditor";
import { MessageDiffCard } from "@/components/editor/MessageDiffCard";
import { TimelineScrubber } from "@/components/editor/TimelineScrubber";
import {
  History, ChevronLeft, ArrowLeftRight, GitCommit, Clock,
  MessageSquare, Sparkles, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";

export const Route = createFileRoute("/projects/$projectId/history")({
  component: HistoryPage,
});

interface ToolCall {
  id: string; name: string; args: Record<string, unknown>;
  status: "running" | "ok" | "error"; error?: string;
  created_at: string;
}

interface AgentMessage {
  id: string;
  role: "assistant";
  parts: Array<{ type: string; text?: string }>;
  tool_calls: ToolCall[];
  created_at: string;
  meta?: Record<string, unknown>;
}

interface FileRow {
  id: string; path: string; content: string; updated_at: string;
}

function HistoryPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/history" });
  const navigate = useNavigate();
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"timeline" | "diff" | "list">("timeline");

  // Load project
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name").eq("id", projectId).single();
      return data;
    },
  });

  // Load conversation
  const { data: conversation } = useQuery({
    queryKey: ["conversation", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations").select("*").eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  // Load all agent messages with tool calls
  const { data: agentMessages, isLoading } = useQuery({
    queryKey: ["agent-messages", conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: true });
      return (data ?? []) as any as AgentMessage[];
    },
    enabled: !!conversation,
  });

  // Load current files for diff context
  const { data: files } = useQuery({
    queryKey: ["files", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_files").select("id, path, content, updated_at")
        .eq("project_id", projectId);
      return (data ?? []) as FileRow[];
    },
  });

  const fileMap = useMemo(() => {
    const map = new Map<string, { content: string; updated_at: string }>();
    files?.forEach((f) => map.set(f.path, { content: f.content ?? "", updated_at: f.updated_at }));
    return map;
  }, [files]);

  const selectedMessage = useMemo(
    () => agentMessages?.find((m) => m.id === selectedMsgId),
    [agentMessages, selectedMsgId],
  );

  const timelineItems = useMemo(() => {
    return (agentMessages ?? []).map((msg) => ({
      id: msg.id,
      timestamp: new Date(msg.created_at).getTime(),
      label: msg.tool_calls.length > 0
        ? `${msg.tool_calls.length} ferramenta${msg.tool_calls.length !== 1 ? "s" : ""}`
        : "Resposta do agente",
      toolCount: msg.tool_calls.length,
      okCount: msg.tool_calls.filter((t) => t.status === "ok").length,
      errorCount: msg.tool_calls.filter((t) => t.status === "error").length,
      runningCount: msg.tool_calls.filter((t) => t.status === "running").length,
    }));
  }, [agentMessages]);

  const totalChanges = agentMessages?.reduce((sum, m) => sum + m.tool_calls.length, 0) ?? 0;

  return (
    <EditorShell
      projectName={project?.name}
      activeView="code"
      onViewChange={(view) => {
        if (view === "preview") {
          navigate({ to: "/projects/$projectId", params: { projectId } });
        }
      }}
    >
      <div className="flex h-full flex-col bg-[var(--lovable-chat)]">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--lovable-border)] px-4">
          <div className="lovable-view-tabs flex gap-1">
            {(["timeline", "diff", "list"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                data-active={viewMode === mode}
                className="lovable-doc-btn"
                onClick={() => setViewMode(mode)}
              >
                {mode === "timeline" ? "Timeline" : mode === "diff" ? "Diff" : "Lista"}
              </button>
            ))}
          </div>
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="lovable-doc-btn ml-auto"
          >
            <ChevronLeft className="mr-1 inline size-3" />
            Editor
          </Link>
        </div>
        <div className="flex items-center gap-4 px-4 h-12 border-b border-[var(--lovable-border)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] grid place-items-center">
              <History className="size-4 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--foreground)]">
                Histórico de Mudanças
              </h2>
              <p className="font-mono text-[9px] text-[var(--text-ghost)]">
                {totalChanges} alterações em {agentMessages?.length ?? 0} resposta{(agentMessages?.length ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-ghost)]">
              <Clock className="size-3" />
              {agentMessages?.length
                ? new Date(agentMessages[agentMessages.length - 1].created_at).toLocaleString("pt-BR")
                : "—"}
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex-1 grid place-items-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-6 text-[var(--primary)] animate-spin" />
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                CARREGANDO HISTÓRICO
              </span>
            </div>
          </div>
        ) : !agentMessages || agentMessages.length === 0 ? (
          <div className="flex-1 grid place-items-center">
            <div className="text-center space-y-3">
              <div className="size-16 rounded-full bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center mx-auto">
                <History className="size-6 text-[var(--text-ghost)]" />
              </div>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                SEM HISTÓRICO AINDA
              </p>
              <p className="font-mono text-[10px] text-[var(--text-dim)]">
                Envie uma mensagem para o agente começar
              </p>
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-[10px] tracking-[0.15em] uppercase hover:bg-[var(--primary)]/20 transition-colors"
              >
                <ArrowLeftRight className="size-3" />
                VOLTAR AO EDITOR
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Sidebar: Timeline scrubber */}
            <div className="w-[300px] shrink-0 border-r border-[var(--border)] bg-[var(--surface-1)]/30 overflow-hidden flex flex-col">
              <TimelineScrubber
                items={timelineItems}
                selectedId={selectedMsgId}
                onSelect={setSelectedMsgId}
              />
            </div>

            {/* Main: Diff viewer */}
            <div className="flex-1 min-w-0 overflow-auto">
              <AnimatePresence mode="wait">
                {selectedMessage ? (
                  <motion.div
                    key={selectedMessage.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    className="h-full"
                  >
                    {viewMode === "diff" ? (
                      <DiffModeView message={selectedMessage} fileMap={fileMap} />
                    ) : viewMode === "list" ? (
                      <ListViewMode message={selectedMessage} />
                    ) : (
                      <TimelineModeView message={selectedMessage} fileMap={fileMap} />
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full grid place-items-center"
                  >
                    <div className="text-center space-y-2">
                      <MessageSquare className="size-6 text-[var(--text-ghost)] mx-auto" />
                      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--text-ghost)]">
                        SELECIONE UMA MENSAGEM
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </EditorShell>
  );
}

// ---------------------------------------------------------------------------
// View Modes
// ---------------------------------------------------------------------------

function TimelineModeView({
  message,
  fileMap,
}: {
  message: AgentMessage;
  fileMap: Map<string, { content: string; updated_at: string }>;
}) {
  return (
    <div className="p-6 space-y-6">
      {/* Message header */}
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center shrink-0">
          <Sparkles className="size-4 text-[var(--primary)]" />
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--primary)]">
            Resposta do FORGE
          </div>
          <div className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5">
            {new Date(message.created_at).toLocaleString("pt-BR")}
          </div>
          {message.parts?.find((p) => p.text) && (
            <div className="mt-3 text-sm text-[var(--text-dim)] max-w-2xl leading-relaxed">
              {message.parts.find((p) => p.text)?.text}
            </div>
          )}
        </div>
      </div>

      {/* Tool calls grid */}
      <div className="space-y-3">
        {message.tool_calls.map((tool) => (
          <MessageDiffCard
            key={tool.id}
            tool={tool}
            fileMap={fileMap}
          />
        ))}
      </div>
    </div>
  );
}

function DiffModeView({
  message,
  fileMap,
}: {
  message: AgentMessage;
  fileMap: Map<string, { content: string; updated_at: string }>;
}) {
  const writeTools = message.tool_calls.filter(
    (t) => t.name === "fs_write" || t.name === "fs_edit",
  );

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar for files */}
      <div className="flex items-center h-8 bg-[var(--surface-1)] border-b border-[var(--border)] px-2 gap-0.5 shrink-0 overflow-x-auto">
        {writeTools.map((tool) => {
          const path = (tool.args.path as string) ?? "unknown";
          return (
            <span
              key={tool.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono text-[var(--text-dim)] bg-[var(--surface-2)]/60 shrink-0"
            >
              <GitCommit className="size-3 text-[var(--text-ghost)]" />
              {path.split("/").pop()}
              {tool.status === "ok" && <CheckCircle2 className="size-3 text-emerald-400" />}
              {tool.status === "error" && <AlertCircle className="size-3 text-[var(--destructive)]" />}
            </span>
          );
        })}
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {writeTools.map((tool) => {
          const path = (tool.args.path as string) ?? "unknown";
          const currentFile = fileMap.get(path);
          const agentContent = (tool.args.content as string) ?? "";

          return (
            <MessageDiffCard key={tool.id} tool={tool} fileMap={fileMap} />
          );
        })}
      </div>
    </div>
  );
}

function ListViewMode({ message }: { message: AgentMessage }) {
  return (
    <div className="p-6 space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <GitCommit className="size-4 text-[var(--text-ghost)]" />
        <span className="font-mono text-[10px] text-[var(--text-dim)]">
          {new Date(message.created_at).toLocaleString("pt-BR")}
        </span>
      </div>

      {message.tool_calls.map((tool) => (
        <div
          key={tool.id}
          className="flex items-start gap-3 py-2 px-3 rounded hover:bg-[var(--surface-2)] transition-colors"
        >
          {tool.status === "ok" ? (
            <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
          ) : tool.status === "error" ? (
            <AlertCircle className="size-4 text-[var(--destructive)] mt-0.5 shrink-0" />
          ) : (
            <Loader2 className="size-4 text-[var(--text-ghost)] mt-0.5 shrink-0 animate-spin" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-[var(--foreground)]">{tool.name}</span>
              <span className="font-mono text-[9px] text-[var(--text-ghost)]">
                {(tool.args.path as string) ?? ""}
              </span>
            </div>
            {tool.status === "error" && tool.error && (
              <div className="text-[10px] text-[var(--destructive)] mt-0.5">{tool.error}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
