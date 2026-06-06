import { supabase } from "@/integrations/supabase/client";
import { formatE2bUserError } from "@/lib/e2b-status";
import { assertEdgeFunctionOk } from "@/lib/edge-function-response";

type SaveE2bResult = {
  ok?: boolean;
  smoke?: { templateUsed?: string };
  error?: string;
  code?: string;
};

export async function saveE2bApiKey(token: string): Promise<SaveE2bResult> {
  const { data, error, response } = await supabase.functions.invoke("connector-upsert", {
    body: {
      kind: "e2b",
      token: token.trim(),
      meta: { label: "E2B Sandbox", connectedAt: new Date().toISOString() },
    },
  });
  const res = await assertEdgeFunctionOk(
    data as SaveE2bResult,
    error,
    formatE2bUserError,
    response,
  );
  if (res.ok === false && res.error) {
    throw new Error(formatE2bUserError(res.error, res.code));
  }
  return res;
}

export async function disconnectE2bApiKey() {
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind: "e2b", disconnect: true },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}