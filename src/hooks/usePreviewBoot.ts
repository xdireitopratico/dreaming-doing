import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";

type BootResult = {
  url?: string;
  expiresAt?: string;
  reused?: boolean;
  ready?: boolean;
  error?: string;
};

export function usePreviewBoot(projectId: string) {
  const [booting, setBooting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);
  const qc = useQueryClient();

  const boot = useCallback(async () => {
    const { url, publishableKey } = getSupabaseEnv();
    if (!url || !publishableKey) {
      const msg = "Preview indisponível neste ambiente.";
      setLastError(msg);
      toast.error(msg);
      return null;
    }

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      const msg = "Faça login para ver o preview.";
      setLastError(msg);
      toast.error(msg);
      return null;
    }

    setBooting(true);
    setLastError(null);
    setWarming(false);
    try {
      const res = await fetch(`${url}/functions/v1/preview-boot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: publishableKey,
        },
        body: JSON.stringify({ projectId }),
      });

      const body = (await res.json()) as BootResult;
      if (!res.ok) {
        throw new Error(body.error ?? `preview-boot HTTP ${res.status}`);
      }

      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      if (body.url) {
        if (body.ready === false) setWarming(true);
        if (!body.reused) {
          toast.success("Preview conectado");
        }
      }
      return body.url ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível abrir o preview";
      setLastError(msg);
      if (msg.includes("E2B_API_KEY")) {
        toast.error("Preview ao vivo requer E2B_API_KEY no Supabase.");
      } else if (!msg.includes("agente")) {
        toast.error(msg.length > 100 ? `${msg.slice(0, 100)}…` : msg);
      }
      return null;
    } finally {
      setBooting(false);
    }
  }, [projectId, qc]);

  return {
    booting,
    boot,
    lastError,
    warming,
    clearWarming: () => setWarming(false),
    clearError: () => setLastError(null),
  };
}