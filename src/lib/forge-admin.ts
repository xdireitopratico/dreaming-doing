import { useMemo } from "react";
import { useAuth } from "@/lib/auth";

/** Admin FORGE — UI gate only; autorização real nas Edge Functions. */
export const FORGE_ADMIN_EMAIL = "xdireitopratico@gmail.com";

export function isForgeAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === FORGE_ADMIN_EMAIL.toLowerCase();
}

/** Hook mínimo para UI admin (Prometheus admin mode, secrets map). */
export function useAdmin() {
  const { user, loading } = useAuth();
  const isAdmin = useMemo(() => isForgeAdminEmail(user?.email), [user?.email]);
  return { isAdmin, loading };
}
