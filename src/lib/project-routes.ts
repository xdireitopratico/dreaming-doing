/** Infere rotas navegáveis do app gerado (Vite/React) a partir dos arquivos do projeto. */

export interface ProjectRoute {
  path: string;
  label: string;
}

const PAGE_FILE = /^(?:src\/)?pages\/([^/]+)\.(tsx|jsx|vue)$/i;
const APP_ROUTE = /path:\s*["'`]([^"'`]+)["'`]/g;
const ROUTE_FILE = /^(?:src\/)?routes\/([^/]+)\.(tsx|jsx)$/i;

function labelFromSegment(seg: string): string {
  if (seg === "index" || seg === "") return "Início";
  return seg
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pathFromPageName(name: string): string {
  const base = name.replace(/\.(tsx|jsx|vue)$/i, "");
  if (base === "index") return "/";
  return `/${base}`;
}

export function inferProjectRoutes(
  filePaths: string[],
  fileContents?: Map<string, string>,
): ProjectRoute[] {
  const routes = new Map<string, string>();

  routes.set("/", "Início");

  for (const p of filePaths) {
    const norm = p.replace(/^\//, "");
    const pageMatch = norm.match(PAGE_FILE);
    if (pageMatch) {
      const path = pathFromPageName(pageMatch[1]);
      routes.set(path, labelFromSegment(pageMatch[1]));
      continue;
    }
    const routeMatch = norm.match(ROUTE_FILE);
    if (routeMatch) {
      const path = pathFromPageName(routeMatch[1]);
      routes.set(path, labelFromSegment(routeMatch[1]));
    }
  }

  const appContent =
    fileContents?.get("src/App.tsx") ??
    fileContents?.get("App.tsx") ??
    fileContents?.get("/src/App.tsx");
  if (appContent) {
    for (const m of appContent.matchAll(APP_ROUTE)) {
      const path = m[1].startsWith("/") ? m[1] : `/${m[1]}`;
      if (path.includes(":")) continue;
      const seg = path.split("/").filter(Boolean).pop() ?? "index";
      routes.set(path, labelFromSegment(seg));
    }
  }

  return Array.from(routes.entries())
    .map(([path, label]) => ({ path, label }))
    .sort((a, b) => {
      if (a.path === "/") return -1;
      if (b.path === "/") return 1;
      return a.path.localeCompare(b.path);
    });
}

export function buildPreviewUrl(base: string, routePath: string): string {
  const root = base.replace(/\/$/, "");
  if (!routePath || routePath === "/") return root;
  return `${root}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}