import { supabase } from "@/integrations/supabase/client";
import { formatE2bUserError } from "@/lib/e2b-status";

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
  const { data, error } = await supabase.functions.invoke("e2b-health", {
    body: token?.trim() ? { token: token.trim() } : {},
  });
  if (error) throw new Error(error.message);
  const res = (data ?? {}) as E2bHealthResponse & { error?: string; code?: string };
  if (res.error && !res.ok) {
    throw new Error(formatE2bUserError(res.error, res.code));
  }
  return res;
}