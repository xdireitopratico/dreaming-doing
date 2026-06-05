// seeds/vite-react.ts — Starter Vite + React 19 + TypeScript + Tailwind v4.
// 10 arquivos. Pronto para `npm install && npm run dev`. Dark theme com paleta neutra.
// Compact mas profissional: nada de placeholder lorem ipsum.

export type SeedFile = { path: string; content: string };

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
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
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

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
`;

const INDEX_HTML = `<!doctype html>
<html lang="pt-BR" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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

const APP_TSX = `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
      <div className="w-full max-w-xl text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-300/90 text-xs font-mono uppercase tracking-[0.25em]">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Forge · Live
        </div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight bg-gradient-to-br from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          Pronto para construir.
        </h1>
        <p className="text-zinc-400 text-base md:text-lg leading-relaxed">
          Descreva no chat o que você quer e o Forge edita esses arquivos em
          tempo real. O preview recarrega sozinho.
        </p>
        <button
          onClick={() => setCount((c) => c + 1)}
          className="inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Contador: {count}
        </button>
        <div className="pt-6 text-xs text-zinc-600 font-mono">
          src/App.tsx · edite à vontade
        </div>
      </div>
    </main>
  );
}
`;

const INDEX_CSS = `@import "tailwindcss";

@theme {
  --color-background: #09090b;
  --color-foreground: #fafafa;
}

html, body, #root { height: 100%; }
body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
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

Gerado pelo FORGE. Vite + React 19 + TypeScript + Tailwind 4.

\`\`\`bash
npm install
npm run dev
\`\`\`
`;

const ENV_EXAMPLE = `# Variáveis do app vão aqui.
# Use VITE_ como prefixo para variáveis acessíveis no client.
# VITE_SUPABASE_URL=
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
];
