/** Admin FORGE — verificação server-side (nunca confiar só no client). */
export const FORGE_ADMIN_EMAIL = "xdireitopratico@gmail.com";

export function isForgeAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === FORGE_ADMIN_EMAIL.toLowerCase();
}

export function assertForgeAdmin(user: { email?: string | null }) {
  if (!isForgeAdminEmail(user.email)) {
    throw new Error("Acesso negado. Área restrita ao administrador do projeto.");
  }
}
