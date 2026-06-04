import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";

type BootResult = {
  url?: string;
  expiresAt?: string;
  reused?: boolean;
  error?: string;
};

export function usePreviewBoot(projectId: string) {
  const [booting, setBooting] = useState(false);
  const qc = useQueryClient();

  const boot = useCallback(
    async (force = false) => {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        toast.error("Supabase não configurado para preview.");
        return null;
      }

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Faça login para iniciar o preview.");
        return null;
      }

      setBooting(true);
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
          toast.success(body.reused ? "Preview reutilizado" : "Preview ao vivo iniciado");
        }
        return body.url ?? null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha ao iniciar preview";
        if (msg.includes("E2B_API_KEY")) {
          toast.error("Preview ao vivo requer E2B_API_KEY no Supabase.");
        } else {
          toast.error(msg);
        }
        return null;
      } finally {
        setBooting(false);
      }
    },
    [projectId, qc],
  );

  return { booting, boot };
}