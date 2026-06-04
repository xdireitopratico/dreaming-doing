import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type ConnectorId,
  type IntegrationMode,
  type IntegrationPrefs,
  parseIntegrationPrefs,
  TRIAL_MESSAGES_DEFAULT,
} from "@/lib/connectors/integration-prefs";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";

export type ConnectorStatus = {
  connected: boolean;
  label?: string;
  meta?: Record<string, unknown>;
  forgeAvailable: boolean;
};

export type { ConnectorId, IntegrationMode, IntegrationPrefs };

export function useConnectors() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<ConnectorId | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("github_username, integration_prefs, trial_messages_remaining")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const modes: IntegrationPrefs = parseIntegrationPrefs(profile?.integration_prefs);

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

  const githubRow = rows.find((r) => r.kind === "github");
  const vercelRow = rows.find((r) => r.kind === "vercel");
  const cloudflareRow = rows.find((r) => r.kind === "cloudflare");

  const status: Record<ConnectorId, ConnectorStatus> = {
    github: {
      forgeAvailable: CONNECTOR_REGISTRY.github.forgeAvailable,
      connected: !!githubRow || !!profile?.github_username,
      label: profile?.github_username
        ? `@${profile.github_username}`
        : (githubRow?.meta as { label?: string })?.label,
      meta: (githubRow?.meta as Record<string, unknown>) ?? {},
    },
    vercel: {
      forgeAvailable: CONNECTOR_REGISTRY.vercel.forgeAvailable,
      connected: !!vercelRow,
      label: (vercelRow?.meta as { projectName?: string })?.projectName as string | undefined,
      meta: (vercelRow?.meta as Record<string, unknown>) ?? {},
    },
    supabase: {
      forgeAvailable: CONNECTOR_REGISTRY.supabase.forgeAvailable,
      connected: isSupabaseConfigured(),
      label: isSupabaseConfigured() ? "FORGE · ativo" : "Não configurado",
      meta: { url: getSupabaseEnv().url },
    },
    cloudflare: {
      forgeAvailable: CONNECTOR_REGISTRY.cloudflare.forgeAvailable,
      connected: !!cloudflareRow,
      label: (cloudflareRow?.meta as { accountId?: string })?.accountId as string | undefined,
      meta: (cloudflareRow?.meta as Record<string, unknown>) ?? {},
    },
    e2b: {
      forgeAvailable: CONNECTOR_REGISTRY.e2b.forgeAvailable,
      connected: false,
      label: modes.e2b === "forge" ? "Sandbox FORGE" : undefined,
      meta: {},
    },
  };

  const trialMessagesRemaining =
    typeof profile?.trial_messages_remaining === "number"
      ? profile.trial_messages_remaining
      : TRIAL_MESSAGES_DEFAULT;

  const setMode = useCallback(
    async (id: ConnectorId, mode: IntegrationMode) => {
      if (!user?.id) return;
      const entry = CONNECTOR_REGISTRY[id];
      if (mode === "forge" && !entry.forgeAvailable) {
        toast.error(`${entry.name} não oferece modo FORGE neste ambiente.`);
        return;
      }

      const next = { ...modes, [id]: mode };
      const { error } = await supabase
        .from("profiles")
        .update({ integration_prefs: next })
        .eq("id", user.id);

      if (error) {
        toast.error("Não foi possível salvar a preferência.");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["profile", user.id] });
    },
    [user?.id, modes, qc],
  );

  const saveConnector = useCallback(
    async (
      kind: ConnectorId,
      payload: { token?: string; meta?: Record<string, unknown>; disconnect?: boolean },
    ) => {
      const entry = CONNECTOR_REGISTRY[kind];

      if (kind === "e2b") {
        if (payload.disconnect) {
          await setMode("e2b", "forge");
          toast.success("Voltou ao sandbox FORGE.");
        } else {
          toast.info(
            "Sandbox FORGE já está ativo. Chave E2B própria será suportada em breve — cadastre-se na E2B para se preparar.",
          );
        }
        setModal(null);
        return;
      }

      if (kind === "supabase") {
        toast.info(
          "Modo FORGE: banco e auth já estão ativos. Modo próprio: configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no seu deploy.",
        );
        setModal(null);
        return;
      }

      const upsertKind = entry.upsertKind;
      if (!upsertKind) {
        setModal(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke("connector-upsert", {
        body: {
          kind: upsertKind,
          token: payload.token,
          meta: payload.meta,
          disconnect: payload.disconnect,
        },
      });

      if (error) throw new Error(error.message);
      const res = data as { error?: string };
      if (res?.error) throw new Error(res.error);

      if (!payload.disconnect) {
        await setMode(kind, "own");
      }

      await qc.invalidateQueries({ queryKey: ["connectors-public"] });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(payload.disconnect ? "Desconectado" : "Conectado com sucesso");
      setModal(null);
    },
    [qc, setMode],
  );

  const openConnector = useCallback((id: ConnectorId) => setModal(id), []);
  const closeModal = useCallback(() => setModal(null), []);

  return {
    status,
    modes,
    setMode,
    modal,
    openConnector,
    closeModal,
    saveConnector,
    trialMessagesRemaining,
  };
}