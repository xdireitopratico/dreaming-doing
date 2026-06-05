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

  const boot = useCallback(
    async (force = false) => {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        const msg = "Supabase não configurado para preview.";
        setLastError(msg);
        toast.error(msg);
        return null;
      }

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        const msg = "Faça login para iniciar o preview.";
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
          body: JSON.stringify({ projectId, force }),
        });

        const body = (await res.json()) as BootResult;
        if (!res.ok) {
          throw new Error(body.error ?? `preview-boot HTTP ${res.status}`);
        }

        await qc.invalidateQueries({ queryKey: ["project", projectId] });
        if (body.url) {
          if (body.ready === false) setWarming(true);
          toast.success(
            body.reused
              ? "Preview reutilizado"
              : body.ready === false
                ? "Sandbox pronto — aguardando Vite…"
                : "Preview ao vivo iniciado",
          );
        }
        return body.url ?? null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha ao iniciar preview";
        const friendly =
          msg === "Failed to fetch"
            ? "preview-boot expirou ou não respondeu (timeout). Tente ↻ de novo."
            : msg;
        setLastError(friendly);
        if (msg.includes("E2B_API_KEY")) {
          toast.error("Preview ao vivo requer E2B_API_KEY no Supabase.");
        } else {
          toast.error(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg);
        }
        return null;
      } finally {
        setBooting(false);
      }
    },
    [projectId, qc],
  );

  return {
    booting,
    boot,
    lastError,
    warming,
    clearWarming: () => setWarming(false),
    clearError: () => setLastError(null),
  };
}