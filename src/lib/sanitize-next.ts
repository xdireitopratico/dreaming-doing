/** Paths allowed as post-auth redirect targets (prevents /auth loops and 404). */
const STATIC_PATHS = new Set(["/", "/projects", "/settings", "/connectors"]);

const PROJECT_PATH =
  /^\/projects\/([^/]+)(?:\/history)?$/;

const DEFAULT_NEXT = "/projects";

/**
 * Normalizes the `next` query param to a safe pathname only.
 * Strips nested `/auth?next=...` chains and rejects auth routes.
 */
export function sanitizeNext(raw?: string | null, fallback = DEFAULT_NEXT): string {
  if (!raw?.trim()) return fallback;

  let path = raw.trim();

  for (let i = 0; i < 8; i++) {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      try {
        path = new URL(path).pathname;
      } catch {
        return fallback;
      }
    }

    if (path.startsWith("/auth")) {
      const qIndex = path.indexOf("?");
      if (qIndex === -1) return fallback;
      const nested = new URLSearchParams(path.slice(qIndex + 1)).get("next");
      if (!nested) return fallback;
      path = decodeURIComponent(nested);
      continue;
    }

    const qIndex = path.indexOf("?");
    if (qIndex !== -1) path = path.slice(0, qIndex);

    break;
  }

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  if (path === "/auth" || path.startsWith("/auth/")) return fallback;
  if (STATIC_PATHS.has(path)) return path;
  if (path === "/projects/") return "/projects";

  if (PROJECT_PATH.test(path)) return path;

  return fallback;
}

export type AuthRedirectTarget =
  | { to: "/"; params?: undefined }
  | { to: "/projects"; params?: undefined }
  | { to: "/settings"; params?: undefined }
  | { to: "/connectors"; params?: undefined }
  | { to: "/projects/$projectId"; params: { projectId: string } }
  | { to: "/projects/$projectId/history"; params: { projectId: string } };

/** Maps a sanitized path to a typed TanStack Router navigation target. */
export function parseAuthRedirect(next?: string | null): AuthRedirectTarget {
  const path = sanitizeNext(next);

  if (path === "/") return { to: "/" };
  if (path === "/projects") return { to: "/projects" };
  if (path === "/settings") return { to: "/settings" };
  if (path === "/connectors") return { to: "/connectors" };

  const historyMatch = path.match(/^\/projects\/([^/]+)\/history$/);
  if (historyMatch) {
    return { to: "/projects/$projectId/history", params: { projectId: historyMatch[1] } };
  }

  const projectMatch = path.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    return { to: "/projects/$projectId", params: { projectId: projectMatch[1] } };
  }

  return { to: "/projects" };
}