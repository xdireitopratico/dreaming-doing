import { supabase } from "@/integrations/supabase/client";

export async function saveE2bApiKey(token: string): Promise<{ smoke?: { templateUsed?: string }; error?: string; code?: string }> {
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: {
      kind: "e2b",
      token: token.trim(),
      meta: { label: "E2B Sandbox", connectedAt: new Date().toISOString() },
    },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string; code?: string; smoke?: { templateUsed?: string } };
  if (res?.error) throw new Error(res.error);
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