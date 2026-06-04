/** Admin FORGE — UI gate only; autorização real nas Edge Functions. */
export const FORGE_ADMIN_EMAIL = "xdireitopratico@gmail.com";

export function isForgeAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === FORGE_ADMIN_EMAIL.toLowerCase();
}