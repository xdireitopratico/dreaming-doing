// skills.ts — Skill Registry compatível com agentskills.io
// Skills são auto-detectadas com base nos arquivos do projeto e ativadas dinamicamente
import type { ToolRegistry } from "./registry.ts";
import type { FileEntry, ToolDefinition } from "./types.ts";

export interface Skill {
  name: string;
  description: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  validate: (files: FileEntry[]) => boolean;
}

export class SkillRegistry {
  private skills: Skill[] = [];

  constructor() {
    // Skills built-in que cobrem 90% dos casos
    this.skills = [
      {
        name: "react-tailwind",
        description: "Projetos React + Tailwind + TypeScript (Vite, TanStack Start, etc.)",
        systemPrompt: `
## Stack Detectada: React + Tailwind + TypeScript

Use React 19 patterns: Server Components (se Next.js/TanStack Start), hooks modernos (useActionState, useOptimistic, useFormStatus).
Tailwind CSS 4 com @theme no CSS (tokens de design: cores, spacing, radius, shadows) — nada de valores hardcoded.
TypeScript estrito: strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes.
Componentes funcionais com hooks. Export default para páginas, named exports para componentes.
Prefira composição a herança. React.memo apenas quando necessário (profiling first).
Acessibilidade: labels em inputs, aria-labels em icon-only buttons, focus-visible visível, contraste 4.5:1.`,
        tools: [],
        validate: (files) =>
          files.some((f) => f.path.includes("package.json") && f.content?.includes("react")),
      },
      {
        name: "nextjs-app-router",
        description: "Next.js 15 App Router — Server Components, Actions, Middleware",
        systemPrompt: `
## Stack Detectada: Next.js 15 App Router

Server Components por DEFAULT. 'use client' APENAS para interatividade (hooks, browser APIs, event handlers).
App Router patterns: layouts (layout.tsx), loading (loading.tsx), error (error.tsx), not-found (not-found.tsx).
Server Actions ('use server') para mutations — forms, DB writes, revalidation. Evite API routes desnecessárias.
Route Groups (folder), Parallel Routes (@slot), Intercepting Routes ((..)) quando apropriado.
Metadata API para SEO/Open Graph/sitemap/robots. next/font para fontes. next/image para imagens.
Middleware (middleware.ts) para auth, i18n, bot protection, rewrites.
generateStaticParams para SSG/ISR em rotas dinâmicas. Cache control: 'force-cache' | 'no-store' | revalidate.
Prefetch automático com <Link> — não desative sem motivo. revalidateTag/revalidatePath para invalidação granular.`,
        tools: [],
        validate: (files) =>
          files.some(
            (f) =>
              f.path === "next.config.js" ||
              f.path === "next.config.ts" ||
              f.path === "next.config.mjs",
          ),
      },
      {
        name: "tanstack-start",
        description: "TanStack Start (React Router v7 + Vite + SSR + TanStack Query)",
        systemPrompt: `
## Stack Detectada: TanStack Start

File-based routing com @tanstack/react-router (route tree em src/routes/__root.tsx + src/routes/*.tsx).
Server Functions (createServerFn) para data loading/mutations no servidor — validação Zod input/output.
SSR por default — 'client' loader apenas quando necessário (interatividade).
TanStack Query v5 integrado: queryKey estruturada, cache automático, invalidation, optimistic updates.
Middleware via createMiddleware para auth, logging, etc.
Vite 7 como bundler — HMR nativo, import.meta.env para env vars.
Error boundaries via ErrorComponent na route. Pending UI via useNavigation()/usePendingServerFn().
Route masks para layout persistence (auth, dashboard, etc.).`,
        tools: [],
        validate: (files) =>
          files.some(
            (f) =>
              f.path.includes("@tanstack/react-start") ||
              f.path.includes("@tanstack/router-plugin"),
          ),
      },
      {
        name: "expo",
        description: "Expo (React Native + Web universal) — Expo Router, NativeWind",
        systemPrompt: `
## Stack Detectada: Expo (React Native + Web)

Expo SDK 51+ + React Native 0.76+ + TypeScript estrito.
Expo Router (file-based routing em app/) — universal web/native.
NativeWind v4 (Tailwind para React Native) ou StyleSheet para estilos.
Hermes engine, new architecture (Fabric/TurboModules) habilitada.
EAS Build para builds nativos, Expo Updates para OTA.
Platform-specific code: .ios.tsx, .android.tsx, .web.tsx quando necessário.
SafeAreaView, KeyboardAvoidingView para layout mobile. useColorScheme para dark mode nativo.
Expo Image (expo-image) para performance. Gesture Handler + Reanimated 3 para animações.`,
        tools: [],
        validate: (files) =>
          files.some(
            (f) =>
              f.path === "app.json" ||
              f.path === "expo-env.d.ts" ||
              f.content?.includes("expo-router"),
          ),
      },
      {
        name: "astro",
        description: "Astro 5 — Content-first, Islands architecture, View Transitions",
        systemPrompt: `
## Stack Detectada: Astro 5

Islands architecture: .astro para layout/components server-only (zero JS por default).
Componentes interativos (React/Svelte/Vue) hidratados seletivamente: 'client:load' | 'client:idle' | 'client:visible' | 'client:media'.
Content Collections (defineCollection em src/content.config.ts) para MD/MDX com validação Zod.
Server-first rendering — SSR ou SSG (output: 'server' | 'static' em astro.config.mjs).
View Transitions API nativa: <ViewTransitions /> no layout + transition:name nos elementos.
Image optimization com @astrojs/image + Sharp. Middleware (Astro 5) para auth, i18n, redirects.
getStaticPaths para SSG de rotas dinâmicas. Astro.glob() ou import.meta.glob() para assets.`,
        tools: [],
        validate: (files) =>
          files.some((f) => f.path === "astro.config.mjs" || f.path === "astro.config.ts"),
      },
      {
        name: "supabase-backend",
        description: "Supabase (Auth + DB + Storage + Realtime + Edge Functions)",
        systemPrompt: `
## Stack Detectada: Supabase Backend

Use @supabase/supabase-js para auth, queries, storage, realtime.
SEMPRE Row Level Security (RLS) nas tabelas — policies baseadas em auth.uid().
Service role key APENAS em Edge Functions (supabase/functions/), NUNCA no frontend.
Para queries complexas: funções PostgreSQL via rpc (supabase.rpc()).
Realtime: supabase.channel().on('postgres_changes', ...).subscribe().
Edge Functions: Deno runtime, import maps, supabase/functions/*/index.ts.
Storage: buckets com policies, signed URLs para upload/download privado.`,
        tools: [],
        validate: (files) =>
          files.some(
            (f) =>
              f.path.includes("supabase") ||
              f.content?.includes("@supabase/supabase-js") ||
              f.content?.includes("createClient"),
          ),
      },
      {
        name: "vite-react",
        description: "Vite 7 + React 19 + TypeScript + Tailwind CSS v4",
        systemPrompt: `
## Stack Detectada: Vite + React

Vite 7 como bundler. HMR nativo. Importe assets diretamente. import.meta.env para env vars.
Entry: src/main.tsx → src/App.tsx. Configure aliases no vite.config.ts (path: @/ → src/).
React 19: useActionState, useOptimistic, useFormStatus, <Suspense> para streaming.
Tailwind CSS v4 via @tailwindcss/vite — tokens em src/index.css com @theme.
Vitest para testes. @vitejs/plugin-react para Fast Refresh.`,
        tools: [],
        validate: (files) =>
          files.some((f) => f.path === "vite.config.ts" || f.path === "vite.config.js"),
      },
      {
        name: "forge-design",
        description: "FORGE design craft — @forge/ui manifest, opinionated compositions, techniques",
        systemPrompt: `
## FORGE Design (OBRIGATÓRIO para UI)

**MISSÃO:** Design único por domínio — multi-seção, alto craft. **Proibido** default HeroSignature+BentoGrid sem composição opinionated.

### Workflow
1. **Plan UI:** use tool \`design_resolve\` (quando disponível) ou leia o design manifest no system prompt.
2. **Build:** \`fs_read\` os paths do pacote resolve antes do 1º patch; **adapte** composição ao domínio.
3. **Valide:** observer checa assinaturas (motion, opinionated hero, anti-phantom).

### @forge/ui
Importe só de \`@forge/ui\`. Catálogo completo está no **design manifest** (Tier 0) — 9 básicos + **11 opinionated** (preferir para craft).
**Proibido** imports da lista phantom (ProcessSteps, LogoWall, ServiceGrid, etc.).

Exemplo adaptado (estúdio de podcast — não copie para outros domínios):
\`\`\`tsx
import { HeroCinematicSpotlight, StickyStackNarrative, Reveal, Button } from "@forge/ui";
\`\`\`

### Tokens @theme (Tailwind v4)
Sem hex hardcoded. Cores: bg-brand-500, bg-background, bg-surface-1. Radius: rounded-lg/xl/2xl. Nunca cite paths CSS ao usuário.

### Motion (obrigatório)
Reveal, Parallax, StaggerContainer, FadeIn, useScrollProgress — conforme técnicas do brief.

### A11y
Focus-visible, aria-label, contraste AA, semantic HTML, prefers-reduced-motion.

### Proibido (observer)
- Stack genérica HeroSignature+BentoGrid sem hero opinionated
- Composites phantom do manifest
- bg-zinc-950/bg-blue-600 genérico, <button> manual, reimplementar Button/Card`,
        tools: [],
        validate: (files) =>
          files.some(
            (f) =>
              f.path.includes("tailwind.config") ||
              f.path.includes("index.css") ||
              f.path.includes("global.css") ||
              f.path.includes("@forge/ui"),
          ),
      },
      {
        name: "testing",
        description: "Test Generation — Vitest, React Testing Library, Playwright",
        systemPrompt: `
## Test Generation (OBRIGATÓRIO para features novas)

UNIT/INTEGRATION (Vitest + React Testing Library):
- Test file: *.test.tsx ao lado do componente
- Render com providers necessários (QueryClient, Theme, Auth, Router)
- Test behavior, not implementation: userEvent.click, screen.getByRole
- Mock externals (API calls, Supabase, next/navigation) com vi.mock()
- Coverage alvo: 60%+ statements, branches, functions, lines

E2E (Playwright):
- Test file: e2e/*.spec.ts
- Page Objects para páginas complexas
- Test critical paths: auth flow, CRUD principal, checkout
- CI: playwright install --with-deps && playwright test

PATTERNS:
- AAA: Arrange, Act, Assert
- Given/When/Then nos nomes: "should render error when email invalid"
- Snapshot testing APENAS para design tokens, não UI completa
- Test utils em test/utils.tsx (renderWithProviders, mockData)`,
        tools: [],
        validate: (files) =>
          files.some(
            (f) =>
              f.path.includes("vitest.config") ||
              f.path.includes("playwright.config") ||
              f.path.endsWith(".test.tsx") ||
              f.path.endsWith(".spec.ts"),
          ),
      },
    ];
  }

  addSkill(skill: Skill): void {
    const existing = this.skills.findIndex((s) => s.name === skill.name);
    if (existing >= 0) {
      this.skills[existing] = skill;
    } else {
      this.skills.push(skill);
    }
  }

  detectActive(files: FileEntry[]): Skill[] {
    const active = this.skills.filter((s) => s.validate(files));
    // Grupos mutuamente exclusivos: skills mais específicas têm precedência
    const exclusivityGroups = [
      ["nextjs-app-router", "tanstack-start", "expo", "android-native", "astro", "vite-react"],
      ["react-tailwind", "vite-react"],
    ];
    for (const group of exclusivityGroups) {
      const groupActive = active.filter((s) => group.includes(s.name));
      if (groupActive.length > 1) {
        // Mantém apenas a primeira (mais específica) do grupo
        const keep = groupActive[0];
        for (let i = active.length - 1; i >= 0; i--) {
          if (groupActive.includes(active[i]) && active[i] !== keep) {
            active.splice(i, 1);
          }
        }
      }
    }
    return active;
  }

  buildSkillPrompt(files: FileEntry[]): string {
    const active = this.detectActive(files);
    if (active.length === 0) return "";

    return active.map((s) => s.systemPrompt).join("\n\n");
  }

  /** Nomes exibidos na timeline — alias retrocompat design-system. */
  resolveDisplayNames(internalNames: string[]): string[] {
    return internalNames.map((n) => (n === "forge-design" ? "design-system" : n));
  }

  registerTools(registry: ToolRegistry, files: FileEntry[]): void {
    const active = this.detectActive(files);
    for (const skill of active) {
      for (const tool of skill.tools) {
        registry.register(tool, async () => ({
          toolCallId: "",
          ok: true,
          output: `[skill:${skill.name}] Tool ${tool.name} executada`,
        }));
      }
    }
  }
}
