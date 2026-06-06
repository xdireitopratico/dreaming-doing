// seeds/vite-react.ts — Vite + React 19 + @forge/ui embutido + Tailwind v4 @theme.
import { FORGE_UI_SEED_FILES } from "./forge-ui-bundle.generated";
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

const APP_TSX = `import { Sparkles, Zap, Layers, Shield, Gauge } from "lucide-react";
import {
  NavShell,
  HeroSignature,
  StatsRibbon,
  BentoGrid,
  FeatureMatrix,
  CTASignature,
  FooterColumns,
  ForgeToaster,
} from "@forge/ui";

export default function App() {
  return (
    <div className="min-h-dvh bg-background text-foreground font-body">
      <ForgeToaster />
      <NavShell
        logo={<span className="text-brand-500">◆ FORGE</span>}
        links={[
          { label: "Recursos", href: "#features" },
          { label: "Bento", href: "#bento" },
          { label: "Preços", href: "#pricing" },
        ]}
        ctaLabel="Começar"
      />
      <main>
        <HeroSignature
          eyebrow="Design System · Live"
          title="Construa interfaces que ninguém esquece."
          subtitle="O Forge entrega composição visual de altíssima complexidade — Hero, Bento, CTA assinatura — sem página branca genérica."
          primaryCta={{ label: "Abrir no chat", variant: "primary" }}
          secondaryCta={{ label: "Ver composição", variant: "outline" }}
          variant="aurora"
        >
          <StatsRibbon
            variant="cards"
            stats={[
              { value: "9", label: "Composites prontos" },
              { value: "100", suffix: "%", label: "Tokens @theme" },
              { value: "<1s", label: "HMR no preview" },
              { value: "0", label: "CTAs azuis genéricos" },
            ]}
          />
        </HeroSignature>

        <section id="bento" className="py-16 md:py-24 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <BentoGrid
            eyebrow="Assinatura visual"
            title="Bento assimétrico — não é grid clone"
            preset="showcase"
            cells={[
              { title: "HeroSignature", description: "Aurora mesh + dual CTA + proof strip", icon: Sparkles, accent: true },
              { title: "Motion nativo", description: "FadeIn, Stagger, HoverLift com reduced-motion", icon: Zap },
              { title: "Tokens semânticos", description: "brand, surface, shadow-glow — zero hex em TSX", icon: Layers },
              { title: "Observer enforcement", description: "Build falha em UI genérica", icon: Shield, span: "md:col-span-2" },
              { title: "Performance", description: "Vite 7 + React 19", icon: Gauge },
            ]}
          />
        </section>

        <section id="features">
          <FeatureMatrix
            title="Matriz de features"
            subtitle="Composição multi-camada obrigatória em todo projeto FORGE"
            features={[
              { icon: Sparkles, title: "Composites", description: "Hero, Bento, CTA, Nav, Footer — prontos para compor." },
              { icon: Layers, title: "Camadas surface", description: "Profundidade visual com bg-surface-* e bordas sutis." },
              { icon: Shield, title: "Anti-genérico", description: "Sem bg-white, sem bg-blue-600, sem botão solto." },
            ]}
          />
        </section>

        <CTASignature
          title="Descreva no chat. Receba design único."
          description="O agente usa @forge/ui e o Observer garante qualidade — você só edita se quiser."
          primaryLabel="Continuar no Forge"
          secondaryLabel="Explorar código"
        />
      </main>

      <FooterColumns
        brand={<p className="font-display font-semibold text-brand-500">FORGE</p>}
        columns={[
          { title: "Produto", links: [{ label: "Recursos", href: "#" }, { label: "Preços", href: "#" }] },
          { title: "Dev", links: [{ label: "Docs", href: "#" }, { label: "GitHub", href: "#" }] },
        ]}
        copyright="© FORGE — seed com @forge/ui embutido"
      />
    </div>
  );
}
`;

const INDEX_CSS = `@import "tailwindcss";

@theme {
  --color-brand-50: #FFFAE5;
  --color-brand-100: #FFF3C4;
  --color-brand-200: #FFE899;
  --color-brand-300: #FFD966;
  --color-brand-400: #FFC933;
  --color-brand-500: #FFB627;
  --color-brand-600: #FF7A1A;
  --color-brand-700: #E65C00;
  --color-brand-800: #B33D00;
  --color-brand-900: #802600;
  --color-brand-500-foreground: #0B0D12;
  --color-accent-500: #22C55E;
  --color-accent-600: #16A34A;
  --color-surface-1: #0B0D12;
  --color-surface-2: #12151C;
  --color-surface-3: #1A1E27;
  --color-surface-4: #252A36;
  --color-background: #05060A;
  --color-foreground: #EDEFF2;
  --color-muted-foreground: #94A3B8;
  --color-border: color-mix(in srgb, #EDEFF2 8%, transparent);
  --color-destructive: #E5484D;
  --color-destructive-foreground: #FAFAFA;
  --color-success: #22C55E;
  --color-ring: #FFB627;
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-2xl: 1rem;
  --radius-full: 9999px;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  --shadow-glow: 0 0 32px rgba(255, 182, 39, 0.32), 0 0 80px rgba(255, 122, 26, 0.18);
  --shadow-glow-silver: 0 0 24px rgba(201, 206, 214, 0.18);
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-mono: "Share Tech Mono", "Fira Code", monospace;
}

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