// seeds/vite-react.ts — Vite + React 19 + @forge/ui embutido + Tailwind v4 @theme.
import { FORGE_UI_SEED_FILES } from "./forge-ui-bundle.generated";
import { buildThemeBlock, MOOD_IDS } from "@forge/ui/tokens";
import type { SeedFile } from "./types";

export type { SeedFile };

const PACKAGE_JSON = `{
  "name": "forge-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173"
  },
  "dependencies": {
    "@forge/ui": "file:./packages/forge-ui",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-tooltip": "^1.2.8",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^12.0.0",
    "lucide-react": "^0.475.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^7.0.0"
  }
}
`;

const VITE_CONFIG = `import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@forge/ui": path.resolve(__dirname, "packages/forge-ui/src/index.ts"),
    },
  },
  server: { host: "0.0.0.0", port: 5173, allowedHosts: true, hmr: { clientPort: 443 } },
});
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@forge/ui": ["packages/forge-ui/src/index.ts"],
      "@forge/ui/*": ["packages/forge-ui/src/*"]
    }
  },
  "include": ["src", "packages/forge-ui/src"]
}
`;

const INDEX_HTML = `<!doctype html>
<html lang="pt-BR" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
    <title>FORGE App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;

/**
 * Ponto de partida para o primeiro plano aprovado.
 * O seed é mínimo para não poluir contexto.
 * No primeiro build após aprovação do plano, o agente deve substituir isso por
 * UMA página completa (landing ou tela principal) adaptada ao domínio do usuário
 * (ex: padaria, SaaS, página de vendas), usando a estrutura do design system de forma
 * contextual + preparação de auth/integrações se connectors já estiverem vinculados ao projeto.
 */
const APP_TSX = `export default function App() {
  return <div className="min-h-dvh bg-background" aria-hidden />;
}
`;

const INDEX_CSS = `@import "tailwindcss";

${buildThemeBlock("ember")}

/* Design mood: ember. Para mudar a identidade visual, substitua o @theme acima
   por outro mood (edite os tokens em src/index.css). Moods disponíveis:
   ${MOOD_IDS.join(", ")}. Escolha um adequado ao domínio do projeto.
   Veja @forge/ui/tokens/moods para a paleta de cada um. */

html, body, #root { height: 100%; }
body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}
`;

const GITIGNORE = `node_modules
dist
.DS_Store
*.local
.env
.env.*
!.env.example
`;

const README = `# Forge App

Vite + React 19 + @forge/ui + Tailwind 4 (@theme).

\`\`\`bash
npm install
npm run dev
\`\`\`
`;

const ENV_EXAMPLE = `# VITE_SUPABASE_URL=
# VITE_SUPABASE_ANON_KEY=
`;

export const VITE_REACT_SEED: SeedFile[] = [
  { path: "package.json", content: PACKAGE_JSON },
  { path: "vite.config.ts", content: VITE_CONFIG },
  { path: "tsconfig.json", content: TSCONFIG },
  { path: "index.html", content: INDEX_HTML },
  { path: "src/main.tsx", content: MAIN_TSX },
  { path: "src/App.tsx", content: APP_TSX },
  { path: "src/index.css", content: INDEX_CSS },
  { path: ".gitignore", content: GITIGNORE },
  { path: ".env.example", content: ENV_EXAMPLE },
  { path: "README.md", content: README },
  ...FORGE_UI_SEED_FILES,
];
