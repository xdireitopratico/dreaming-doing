import { supabase } from "@/integrations/supabase/client";
import { formatE2bUserError } from "@/lib/e2b-status";
import { assertEdgeFunctionOk } from "@/lib/edge-function-response";

export type E2bHealthResponse = {
  ok: boolean;
  keyOk?: boolean;
  templateUsed?: string | null;
  nodeOk?: boolean;
  npmOk?: boolean;
  nodeVersion?: string;
  npmVersion?: string;
  latencyMs?: number;
  error?: string;
  code?: string;
};

export async function testE2bApiKey(token?: string): Promise<E2bHealthResponse> {
  const { data, error, response } = await supabase.functions.invoke("e2b-health", {
    body: token?.trim() ? { token: token.trim() } : {},
  });
  const res = await assertEdgeFunctionOk(
    (data ?? {}) as E2bHealthResponse & { error?: string; code?: string },
    error,
    formatE2bUserError,
    response,
  );
  if (!res.ok && res.error) {
    throw new Error(formatE2bUserError(res.error, res.code));
  }
  return res;
}