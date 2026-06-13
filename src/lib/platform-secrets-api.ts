import { supabase } from "@/integrations/supabase/client";

/** Secrets globais da plataforma usados pelo motor Prometheus (pesquisa web, etc.). */
export type MotorPlatformSecretName = "FIRECRAWL_API_KEY";

export type PlatformSecretStatus = {
  name: MotorPlatformSecretName;
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
  fromEdgeEnv: boolean;
};

type EdgeResponse = {
  ok?: boolean;
  error?: string;
  secrets?: PlatformSecretStatus[];
  name?: string;
  hint?: string;
  configured?: boolean;
};

async function invokePlatformSecrets(body: Record<string, unknown>): Promise<EdgeResponse> {
  const { data, error } = await supabase.functions.invoke("admin-platform-secrets", { body });
  if (error) throw new Error(error.message);
  const res = data as EdgeResponse;
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function listMotorPlatformSecrets(): Promise<PlatformSecretStatus[]> {
  const res = await invokePlatformSecrets({ action: "list" });
  const names = new Set<MotorPlatformSecretName>(["FIRECRAWL_API_KEY"]);
  return (res.secrets ?? []).filter((s) => names.has(s.name as MotorPlatformSecretName));
}

export async function upsertMotorPlatformSecret(
  name: MotorPlatformSecretName,
  value: string,
): Promise<{ hint: string | null }> {
  const res = await invokePlatformSecrets({ action: "upsert", name, value: value.trim() });
  return { hint: res.hint ?? null };
}

export async function deleteMotorPlatformSecret(name: MotorPlatformSecretName): Promise<void> {
  await invokePlatformSecrets({ action: "delete", name });
}