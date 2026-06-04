import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PlatformConnectorId = "github" | "supabase" | "vercel" | "cloudflare";

export type IntegrationMode = "forge" | "own";

export type PlatformConnectorStatus = {
  connected: boolean;
  label?: string;
  meta?: Record<string, unknown>;
  forgeAvailable: boolean;
};

const FORGE_MANAGED = {
  supabase: true,
  vercel: true,
  github: true,
  cloudflare: false,
} as const;

export function usePlatformConnectors() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<PlatformConnectorId | null>(null);
  const [modes, setModes] = useState<Record<PlatformConnectorId, IntegrationMode>>({
    github: "forge",
    supabase: "forge",
    vercel: "forge",
    cloudflare: "own",
  });

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
  const cloudflareRow = rows.find((r) => r.kind === "cloudflare");

  const status: Record<PlatformConnectorId, PlatformConnectorStatus> = {
    github: {
      forgeAvailable: FORGE_MANAGED.github,
      connected: !!githubRow || !!profile?.github_username,
      label: profile?.github_username
        ? `@${profile.github_username}`
        : (githubRow?.meta as { label?: string })?.label,
      meta: (githubRow?.meta as Record<string, unknown>) ?? {},
    },
    vercel: {
      forgeAvailable: FORGE_MANAGED.vercel,
      connected: !!vercelRow,
      label: (vercelRow?.meta as { projectName?: string })?.projectName as string | undefined,
      meta: (vercelRow?.meta as Record<string, unknown>) ?? {},
    },
    supabase: {
      forgeAvailable: FORGE_MANAGED.supabase,
      connected: isSupabaseConfigured(),
      label: isSupabaseConfigured() ? "FORGE · projeto ativo" : "Não configurado",
      meta: { url: getSupabaseEnv().url },
    },
    cloudflare: {
      forgeAvailable: FORGE_MANAGED.cloudflare,
      connected: !!cloudflareRow,
      label: (cloudflareRow?.meta as { accountId?: string })?.accountId as string | undefined,
      meta: (cloudflareRow?.meta as Record<string, unknown>) ?? {},
    },
  };

  const setMode = useCallback((id: PlatformConnectorId, mode: IntegrationMode) => {
    setModes((m) => ({ ...m, [id]: mode }));
  }, []);

  const saveConnector = useCallback(
    async (
      kind: PlatformConnectorId,
      payload: { token?: string; meta?: Record<string, unknown>; disconnect?: boolean },
    ) => {
      if (kind === "supabase") {
        toast.info(
          "Supabase FORGE já está ativo neste deploy. Para usar seu projeto, configure VITE_SUPABASE_* na Vercel.",
        );
        setModal(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke("connector-upsert", {
        body: {
          kind,
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

  const openConnector = useCallback((id: PlatformConnectorId) => setModal(id), []);
  const closeModal = useCallback(() => setModal(null), []);

  return {
    status,
    modes,
    setMode,
    modal,
    openConnector,
    closeModal,
    saveConnector,
  };
}