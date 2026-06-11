import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatState } from "@/lib-v2/chat-types";
import { INITIAL_CHAT_STATE } from "@/lib-v2/chat-types";

export function useChatState() {
  const [state, setState] = useState<ChatState>(INITIAL_CHAT_STATE);
  const runIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (projectId: string, conversationId: string, text: string) => {
      setState({ status: "running", runId: null, streamText: null, error: null });

      const { error: msgError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "user",
        parts: [{ type: "text", text }],
        meta: { mode: "chat" },
      });

      if (msgError) {
        setState({ status: "error", runId: null, streamText: null, error: msgError.message });
        return false;
      }

      const { data, error } = await supabase.functions.invoke("agent-run", {
        body: {
          projectId,
          conversationId,
          preferences: {},
          mode: "chat",
        },
      });

      if (error || !data?.runId) {
        setState({
          status: "error",
          runId: null,
          streamText: null,
          error: error?.message ?? "Falha ao iniciar agente",
        });
        return false;
      }

      const runId: string = data.runId;
      runIdRef.current = runId;
      setState((s) => ({ ...s, runId }));
      return true;
    },
    [],
  );

  const stop = useCallback(async () => {
    const runId = runIdRef.current;
    if (runId) {
      await supabase.functions.invoke("agent-run", {
        body: { projectId: "", conversationId: "", mode: "cancel", runId },
      });
    }
    runIdRef.current = null;
    setState(INITIAL_CHAT_STATE);
  }, []);

  const updateStreamText = useCallback((text: string | null) => {
    setState((s) => ({ ...s, streamText: text }));
  }, []);

  const markFinished = useCallback(() => {
    runIdRef.current = null;
    setState(INITIAL_CHAT_STATE);
  }, []);

  const markError = useCallback((error: string) => {
    runIdRef.current = null;
    setState({ status: "error", runId: null, streamText: null, error });
  }, []);

  return {
    state,
    runId: runIdRef.current,
    sendMessage,
    stop,
    updateStreamText,
    markFinished,
    markError,
  };
}
