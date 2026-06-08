/** Paths do pacote @forge/ui embutido no seed — ocultos na árvore do editor. */
export const FORGE_UI_PREFIX = "packages/forge-ui/";

/** Marcador virtual: folha read-only na árvore em vez de centenas de arquivos. */
export const FORGE_UI_BUNDLED_MARKER = "packages/forge-ui/BUNDLED.md";

const BUNDLED_MARKER_CONTENT = `# @forge/ui (design system embutido)

Este pacote vem pré-instalado no seed do projeto (~40 componentes FORGE).

- **Não edite** arquivos aqui pelo editor — use \`src/\` para o seu app.
- O agente importa com \`import { Button } from "@forge/ui"\`.
- Canvas vazio em \`src/App.tsx\` é intencional até o primeiro build no chat.
`;

export function isForgeUiBundlePath(path: string): boolean {
  return (
    path.startsWith(FORGE_UI_PREFIX) ||
    path === FORGE_UI_PREFIX.slice(0, -1) ||
    path === FORGE_UI_BUNDLED_MARKER
  );
}

/** Reduz a árvore: esconde \`packages/forge-ui/**\` e mostra um único marcador. */
export function collapseForgeUiBundle(paths: string[]): string[] {
  const hasBundle = paths.some((p) => p.startsWith(FORGE_UI_PREFIX) || p === "packages/forge-ui");
  const visible = paths.filter(
    (p) => !p.startsWith(FORGE_UI_PREFIX) && p !== "packages/forge-ui",
  );
  if (hasBundle) {
    visible.push(FORGE_UI_BUNDLED_MARKER);
  }
  return visible.sort();
}

export function bundledMarkerContent(): string {
  return BUNDLED_MARKER_CONTENT;
}