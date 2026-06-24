// prompts.ts — Stack por template + guia de design (identidade e tools vivem em agent-system-input).

import { VIBE_EXECUTE_RULES } from "./vibe-coding-prompt.ts";

export type ProjectTemplateId =
  | "vite-react"
  | "nextjs-app-router"
  | "tanstack-start"
  | "expo"
  | "android-native"
  | "astro"
  | "node-api"
  | "static-html"
  | "custom";

/** Guia enxuto — catálogo completo no design manifest + skill forge-design. */
export const DESIGN_GUIDE = `## Design
O pedido do usuário define forma, tom e paleta. **Proibido** receita fixa repetida entre projetos.

### Moods (@theme)
ember · ocean · forest · mono · neon · sand · royal · sunset — escolha conforme domínio. Sem hex hardcoded.

### Princípios
Ritmo vertical entre seções · hierarquia tipográfica · superfícies em camadas · motion com intenção · UM gesto memorável por página · a11y AA.

### @forge/ui
Importe só de \`@forge/ui\`. **Catálogo verdadeiro:** design manifest no system prompt (9 básicos + 15 opinionated + 17 técnicas). Prefira composições **opinionated** para craft. \`fs_read\` técnicas on-demand e adapte.

Detalhes de enforcement, workflow e tokens: skill **forge-design**.

**Nunca cite** paths internos nem \`@forge/ui\` ao usuário no chat/plano.`;

export const STACK_FLEX = `## Stack flexível
- Padrão deste projeto: seção acima.
- Outra tecnologia pedida explicitamente: não recuse — adapte via shell_exec e documente no chat.
- Não invente APIs ou pacotes inexistentes.`;

const NEXTJS_APP_ROUTER_PROMPT = `## Stack do projeto — Next.js 15 App Router
- Next.js 15 + React 19 + TypeScript + Tailwind v4
- App Router (app/), Server Components por padrão, 'use client' só quando necessário
- Server Actions para mutations; Metadata API; next/font, next/image, middleware

## Padrões
- Suspense, error.tsx, not-found.tsx por segmento
- generateStaticParams, cache/revalidate, cacheTag/revalidateTag`;

const TANSTACK_START_PROMPT = `## Stack do projeto — TanStack Start
- TanStack Start + React 19 + TypeScript + Tailwind v4 + Vite 7
- File-based routing (src/routes/), Server Functions, TanStack Query v5, SSR default

## Padrões
- Loaders + Server Functions com Zod; optimistic updates; ErrorComponent na route`;

const EXPO_PROMPT = `## Stack do projeto — Expo
- Expo SDK 51+ + React Native + TypeScript + Expo Router (app/)
- NativeWind ou StyleSheet; Hermes; EAS Build / Updates

## Padrões
- Platform files (.ios/.android/.web); SafeAreaView; expo-image; Gesture Handler + Reanimated`;

const ASTRO_PROMPT = `## Stack do projeto — Astro 5
- Astro 5 + TypeScript + Tailwind v4; islands; Content Collections; SSR ou SSG

## Padrões
- .astro server-first; client:* seletivo; getStaticPaths; View Transitions quando fizer sentido`;

const VITE_REACT_PROMPT = `## Stack do projeto — Vite + React
- Vite 7 + React 19 + TypeScript + Tailwind v4 (@theme em src/index.css)
- Entry: src/main.tsx → src/App.tsx; seed já existe — evite "npm create vite" sem pedido explícito

## Seed
- \`src/App.tsx\` começa como canvas vazio (placeholder) — não é bug.
- Build: substitua placeholder com UI real conforme o pedido.
- "O que temos pronto?" = inventário honesto (scaffold), sem alucinar app pronto.`;

const NODE_API_PROMPT = `## Stack do projeto — Node API
- Node/TypeScript; Hono/Fastify/Express + Zod; OpenAPI; auth (JWT/sessions); Drizzle/Prisma + Postgres
- Se o seed ainda for Vite/React, reestruture via shell_exec conforme o pedido`;

const STATIC_HTML_PROMPT = `## Stack do projeto — estático
- HTML/CSS/JS leve; Vite, 11ty ou Astro static; Tailwind v4; interatividade mínima (vanilla/Alpine)`;

const ANDROID_NATIVE_PROMPT = `## Stack do projeto — Android nativo
- Kotlin + Gradle (app/src/main); sem preview Vite — entregas via arquivos + logs de build
- shell_exec: ./gradlew assembleDebug

## Seed
- MainActivity placeholder até implementar UI e lógica; narre entregas parciais`;

const CUSTOM_PROMPT = `## Stack do projeto — custom
- Sob medida: qualifique, escolha stack, scaffold via shell_exec e implemente`;

const PROMPTS: Record<ProjectTemplateId, string> = {
  "vite-react": VITE_REACT_PROMPT,
  "nextjs-app-router": NEXTJS_APP_ROUTER_PROMPT,
  "tanstack-start": TANSTACK_START_PROMPT,
  expo: EXPO_PROMPT,
  "android-native": ANDROID_NATIVE_PROMPT,
  astro: ASTRO_PROMPT,
  "node-api": NODE_API_PROMPT,
  "static-html": STATIC_HTML_PROMPT,
  custom: CUSTOM_PROMPT,
};

export function getProjectStackPrompt(template: string | null | undefined): string {
  const id = (template ?? "vite-react") as ProjectTemplateId;
  return PROMPTS[id] ?? PROMPTS["vite-react"];
}

/** @deprecated Use getProjectStackPrompt — planMode não altera mais o stack prompt. */
export function getSystemPrompt(
  template: string | null | undefined,
  _planMode = false,
): string {
  return getProjectStackPrompt(template);
}

export {
  buildStackContext,
  stackPromptAddon,
  type DeployTarget,
  type StackContext,
} from "../_shared/stack-context.ts";

const STACK_ENFORCEMENT_LABELS: Record<string, { name: string; constraint: string }> = {
  "vite-react": {
    name: "Vite + React + TypeScript + Tailwind v4",
    constraint:
      "Todo código DEVE ser React/TypeScript. Use src/App.tsx como entry. NÃO gere Android/Kotlin, Swift, Flutter ou qualquer stack não-web a menos que o usuário peça EXPLICITAMENTE a troca.",
  },
  expo: {
    name: "Expo (React Native + Web)",
    constraint:
      "Todo código DEVE ser Expo/React Native. Use app/ directory (Expo Router). NÃO gere Vite-only, Android/Kotlin nativo, ou Flutter a menos que o usuário peça EXPLICITAMENTE a troca.",
  },
  "android-native": {
    name: "Android Nativo (Kotlin/Gradle)",
    constraint:
      "Todo código DEVE ser Kotlin/Gradle (app/src/main). NÃO gere React, Vite, Expo, ou qualquer framework web como stack principal a menos que o usuário peça EXPLICITAMENTE a troca.",
  },
  "nextjs-app-router": {
    name: "Next.js 15 App Router",
    constraint:
      "Todo código DEVE usar Next.js App Router (app/ directory). NÃO gere Vite-only, Expo, ou Android nativo a menos que o usuário peça EXPLICITAMENTE a troca.",
  },
  "tanstack-start": {
    name: "TanStack Start (React + SSR)",
    constraint:
      "Todo código DEVE usar TanStack Start/Router. NÃO gere Next.js, Expo, ou Android nativo a menos que o usuário peça EXPLICITAMENTE a troca.",
  },
  astro: {
    name: "Astro (Content-first)",
    constraint:
      "Todo código DEVE usar Astro (.astro files, islands). NÃO gere Next.js, Vite puro, ou Android nativo a menos que o usuário peça EXPLICITAMENTE a troca.",
  },
};

export function buildStackEnforcement(template: string): string {
  const entry = STACK_ENFORCEMENT_LABELS[template];
  if (!entry) return "";
  return `## Stack enforcement
**Configurado:** ${entry.name}
${entry.constraint}
Troca de stack só com pedido explícito do usuário.`;
}

/** @deprecated Use buildExecuteInstruction() com o pedido literal do usuário. */
export const EXECUTE_PROMPT = `Implemente usando ferramentas. Não responda só com texto.`;

/** @deprecated Use VIBE_EXECUTE_TAIL via agent-system-input. */
export const EXECUTE_RULES = VIBE_EXECUTE_RULES;