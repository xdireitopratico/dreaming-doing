import { createClient } from "@supabase/supabase-js";

const FORGE_PROJECT_REF = "dpduljngdurfpmaclffa";

/**
 * Sessão Supabase serializada para localStorage (formato @supabase/supabase-js).
 * @returns {{ storageKey: string, sessionJson: string, userId: string }}
 */
export async function buildSupabaseAuthStorage({ url, anonKey, email, password }) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session?.user?.id) {
    throw new Error(error?.message ?? "signInWithPassword sem sessão");
  }

  const storageKey = `sb-${FORGE_PROJECT_REF}-auth-token`;
  const payload = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };

  return {
    storageKey,
    sessionJson: JSON.stringify(payload),
    userId: data.session.user.id,
  };
}