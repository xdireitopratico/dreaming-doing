import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ConnectorId = "github" | "supabase" | "vercel";

export type ConnectorStatus = {
  connected: boolean;
  label?: string;
  meta?: Record<string, unknown>;
};

export function useEditorConnectors() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<ConnectorId | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["connectors-public", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connectors_public")
        .select("kind, meta, updated_at")
        .eq("owner_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("github_username")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const githubRow = rows.find((r) => r.kind === "github");
  const vercelRow = rows.find((r) => r.kind === "vercel");

  const status: Record<ConnectorId, ConnectorStatus> = {
    github: {
      connected: !!githubRow || !!profile?.github_username,
      label: profile?.github_username
        ? `@${profile.github_username}`
        : (githubRow?.meta as { label?: string })?.label,
      meta: (githubRow?.meta as Record<string, unknown>) ?? {},
    },
    vercel: {
      connected: !!vercelRow,
      label: (vercelRow?.meta as { projectName?: string })?.projectName as string | undefined,
      meta: (vercelRow?.meta as Record<string, unknown>) ?? {},
    },
    supabase: {
      connected: isSupabaseConfigured(),
      label: isSupabaseConfigured() ? "Projeto ativo" : "Não configurado",
      meta: { url: getSupabaseEnv().url },
    },
  };

  const saveConnector = useCallback(
    async (
      kind: ConnectorId,
      payload: { token?: string; meta?: Record<string, unknown>; disconnect?: boolean },
    ) => {
      if (kind === "supabase") {
        toast.info(
          "Supabase é configurado nas variáveis do deploy (Vercel/Lovable). Já está ativo neste ambiente.",
        );
        setModal(null);
        return;
      }

      const dbKind = kind;
      const { data, error } = await supabase.functions.invoke("connector-upsert", {
        body: {
          kind: dbKind,
          token: payload.token,
          meta: payload.meta,
          disconnect: payload.disconnect,
        },
      });

      if (error) throw new Error(error.message);
      const res = data as { error?: string };
      if (res?.error) throw new Error(res.error);

      await qc.invalidateQueries({ queryKey: ["connectors-public"] });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(payload.disconnect ? "Desconectado" : "Conectado com sucesso");
      setModal(null);
    },
    [qc],
  );

  const openConnector = useCallback((id: ConnectorId) => setModal(id), []);
  const closeModal = useCallback(() => setModal(null), []);

  return {
    status,
    modal,
    openConnector,
    closeModal,
    saveConnector,
  };
}