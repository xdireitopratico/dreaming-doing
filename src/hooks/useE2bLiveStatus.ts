import { useCallback, useEffect, useState } from "react";
import { testE2bApiKey } from "@/lib/test-e2b-key";

export type E2bLiveStatus = {
  configured: boolean;
  ok: boolean | null;
  label: string;
  checking: boolean;
  refresh: () => void;
};

/** Badge E2B no editor — smoke leve quando conector está configurado. */
export function useE2bLiveStatus(e2bConnected: boolean): E2bLiveStatus {
  const [ok, setOk] = useState<boolean | null>(e2bConnected ? true : null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(() => {
    if (!e2bConnected) {
      setOk(null);
      return;
    }
    setChecking(true);
    void testE2bApiKey()
      .then((r) => setOk(r.ok))
      .catch(() => setOk(false))
      .finally(() => setChecking(false));
  }, [e2bConnected]);

  useEffect(() => {
    if (!e2bConnected) {
      setOk(null);
      return;
    }
    refresh();
    const id = window.setInterval(refresh, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [e2bConnected, refresh]);

  const label = !e2bConnected
    ? "E2B não configurado"
    : checking
      ? "E2B verificando…"
      : ok
        ? "E2B OK"
        : "E2B com problema";

  return { configured: e2bConnected, ok, label, checking, refresh };
}