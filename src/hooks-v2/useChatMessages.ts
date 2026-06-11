import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/lib-v2/chat-types";

export function useChatMessages(conversationId: string | null | undefined) {
  const {
    data: rawMessages,
    isPending,
    isFetching,
  } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!conversationId,
  });

  const messages: ChatMessage[] = useMemo(() => {
    return (rawMessages ?? []).map((m) => {
      const roleRaw = String(m.role ?? "").toLowerCase();
      const role: ChatMessage["role"] =
        roleRaw === "user" ? "user" : roleRaw === "assistant" ? "assistant" : "tool";
      const meta = m.meta ?? null;
      const runId =
        meta &&
        typeof meta === "object" &&
        typeof (meta as Record<string, unknown>).runId === "string"
          ? ((meta as Record<string, unknown>).runId as string)
          : undefined;
      return {
        id: m.id,
        role,
        content: Array.isArray(m.parts)
          ? (m.parts as Array<{ text?: string }>).map((p) => p.text).join("\n")
          : "",
        runId,
        meta: meta as Record<string, unknown> | undefined,
        timestamp: new Date(m.created_at).getTime(),
      };
    });
  }, [rawMessages]);

  const loading = !!conversationId && (isPending || (isFetching && rawMessages === undefined));

  return { messages, loading };
}
