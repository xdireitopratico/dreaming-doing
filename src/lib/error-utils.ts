/**
 * Extracts a human-readable message from an unknown error value.
 *
 * Replaces the repeated `err instanceof Error ? err.message : String(err)`
 * pattern used across the codebase.
 */
export function errorMessage(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (fallback) return fallback;
  return String(err);
}
