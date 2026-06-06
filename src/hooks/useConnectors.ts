import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

import { toast } from "sonner";
import {
  type ConnectorId,
  type IntegrationMode,
  type IntegrationPrefs,
  parseIntegrationPrefs,
  TRIAL_MESSAGES_DEFAULT,
} from "@/lib/connectors/integration-prefs";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { hasLlmConnectorRows } from "@/lib/connector-llm";
import { isE2bConfigured } from "@/lib/e2b-status";

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
  const navigate = useNavigate();
  const [modal, setModal] = useState<ConnectorId | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "github_username, integration_prefs, trial_messages_remaining, taste_chat_remaining, taste_start_remaining",
        )
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connectors_public")
        .select("kind, provider, meta, updated_at")
        .eq("owner_id", user!.id);
      if (error) throw error;
      return (data ?? []) as Array<{
        kind: string | null;
        provider?: string | null;
        meta?: Record<string, unknown> | null;
        updated_at?: string | null;
      }>;
    },
  });

  const hasUserLlmKey = hasLlmConnectorRows(rows);

  const githubRow = rows.find((r) => r.kind === "github");
  const vercelRow = rows.find((r) => r.kind === "vercel");
  const netlifyRow = rows.find((r) => r.kind === "netlify");
  const cloudflareRow = rows.find((r) => r.kind === "cloudflare");
  const supabaseRow = rows.find((r) => (r.kind as string) === "supabase");
  const e2bRow = rows.find((r) => (r.kind as string) === "e2b");
  const e2bConfigured = isE2bConfigured(rows);

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
    netlify: {
      forgeAvailable: CONNECTOR_REGISTRY.netlify.forgeAvailable,
      connected: !!netlifyRow,
      label: (netlifyRow?.meta as { siteName?: string })?.siteName as string | undefined,
      meta: (netlifyRow?.meta as Record<string, unknown>) ?? {},
    },
    supabase: {
      forgeAvailable: CONNECTOR_REGISTRY.supabase.forgeAvailable,
      connected: !!supabaseRow,
      label: supabaseRow
        ? ((supabaseRow.meta as { projectRef?: string })?.projectRef as string | undefined) ??
          "Projeto conectado"
        : undefined,
      meta: (supabaseRow?.meta as Record<string, unknown>) ?? {},
    },
    cloudflare: {
      forgeAvailable: CONNECTOR_REGISTRY.cloudflare.forgeAvailable,
      connected: !!cloudflareRow,
      label: (cloudflareRow?.meta as { accountId?: string })?.accountId as string | undefined,
      meta: (cloudflareRow?.meta as Record<string, unknown>) ?? {},
    },
    e2b: {
      forgeAvailable: CONNECTOR_REGISTRY.e2b.forgeAvailable,
      connected: e2bConfigured,
      label: e2bConfigured ? "E2B · sua conta" : undefined,
      meta: (e2bRow?.meta as Record<string, unknown>) ?? {},
    },
  };

  const tasteQuota = (() => {
    const chat =
      typeof profile?.taste_chat_remaining === "number"
        ? profile.taste_chat_remaining
        : typeof profile?.trial_messages_remaining === "number"
          ? profile.trial_messages_remaining
          : TRIAL_MESSAGES_DEFAULT;
    const start =
      typeof profile?.taste_start_remaining === "number" ? profile.taste_start_remaining : 1;
    return { tasteChatRemaining: chat, tasteStartRemaining: start };
  })();

  /** @deprecated use tasteChatRemaining */
  const trialMessagesRemaining = tasteQuota.tasteChatRemaining;

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
        setModal(null);
        toast.info("Chave E2B fica em API Keys.");
        void navigate({ to: "/api", hash: "forge-key-e2b" });
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

  const openConnector = useCallback(
    (id: ConnectorId) => {
      if (id === "e2b") {
        void navigate({ to: "/api", hash: "forge-key-e2b" });
        return;
      }
      setModal(id);
    },
    [navigate],
  );
  const closeModal = useCallback(() => setModal(null), []);

  return {
    status,
    modes,
    rows,
    setMode,
    modal,
    openConnector,
    closeModal,
    saveConnector,
    trialMessagesRemaining,
    tasteChatRemaining: tasteQuota.tasteChatRemaining,
    tasteStartRemaining: tasteQuota.tasteStartRemaining,
    hasUserLlmKey,
  };
}