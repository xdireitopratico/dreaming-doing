import { supabase } from "@/integrations/supabase/client";

export type PlatformSecretStatus = {
  name: string;
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
  fromEdgeEnv?: boolean;
};

export async function fetchAdminSecretStatus(): Promise<{
  isAdmin: boolean;
  secrets: PlatformSecretStatus[];
}> {
  const { data, error } = await supabase.functions.invoke("admin-platform-secrets", {
    body: { action: "list" },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string; secrets?: PlatformSecretStatus[] };
  if (res?.error) throw new Error(res.error);
  return { isAdmin: true, secrets: res.secrets ?? [] };
}

export async function upsertAdminPlatformSecret(name: string, value: string) {
  const { data, error } = await supabase.functions.invoke("admin-platform-secrets", {
    body: { action: "upsert", name, value },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
  return data;
}

export async function deleteAdminPlatformSecret(name: string) {
  const { data, error } = await supabase.functions.invoke("admin-platform-secrets", {
    body: { action: "delete", name },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}