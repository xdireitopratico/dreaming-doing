/** Inferência leve de stack a partir do prompt (expandível com LLM depois). */

export type ProjectStackId =
  | "vite-react"
  | "expo"
  | "android-native"
  | "node-api"
  | "static-html"
  | "custom";

export type StackDecision = {
  id: ProjectStackId;
  label: string;
  reason: string;
};

const DEFAULT: StackDecision = {
  id: "vite-react",
  label: "Vite + React 19 + TypeScript + Tailwind v4",
  reason: "Stack web padrão FORGE — UI rica, preview ao vivo, design system.",
};

const EXPO_STACK: StackDecision = {
  id: "expo",
  label: "Expo + React Native (web + celular)",
  reason: "App mobile com preview web imediato no FORGE e QR para Expo Go.",
};

const ANDROID_NATIVE_STACK: StackDecision = {
  id: "android-native",
  label: "Android nativo (Kotlin/Gradle)",
  reason: "Build nativo — progresso no file tree e console; sem iframe Vite.",
};

const EXPO_RE = /\b(expo|expo-router|react native|react-native|expo go)\b/i;

const ANDROID_NATIVE_RE =
  /\b(android nativo|kotlin|gradle|\.kt\b|swift\b|ios nativo|app nativo)\b/i;

const MOBILE_GENERIC_RE =
  /\b(app mobile|aplicativo mobile|app de celular|mobile app|app android|app ios)\b/i;

export function inferStackFromPrompt(prompt: string): StackDecision {
  const p = prompt.toLowerCase();

  if (EXPO_RE.test(p)) {
    return EXPO_STACK;
  }

  if (ANDROID_NATIVE_RE.test(p) && !EXPO_RE.test(p)) {
    return ANDROID_NATIVE_STACK;
  }

  if (MOBILE_GENERIC_RE.test(p) && !/\b(web|landing|site|dashboard)\b/.test(p)) {
    return EXPO_STACK;
  }

  if (
    /\b(api|backend|rest|graphql|webhook|fastify|express|hono)\b/.test(p) &&
    !/\b(react|vue|svelte|frontend|landing|dashboard|ui)\b/.test(p)
  ) {
    return {
      id: "node-api",
      label: "Node API",
      reason: "Pedido focado em backend/API — agente pode estruturar servidor Node.",
    };
  }

  if (
    /\b(html estático|static site|one.?page|landing simples)\b/.test(p) &&
    !/\b(react|dashboard|auth|supabase)\b/.test(p)
  ) {
    return {
      id: "static-html",
      label: "HTML/CSS estático",
      reason: "Site estático leve — sem bundler pesado.",
    };
  }

  if (/\b(python|django|flask|rust|go |golang)\b/.test(p)) {
    return {
      id: "custom",
      label: "Stack sob medida",
      reason: "Tecnologia fora do seed padrão — agente usa shell_exec para scaffold adequado.",
    };
  }

  return DEFAULT;
}

/** Pedido mobile sem stack explícita — clarify deve perguntar Expo vs nativo. */
export function isAmbiguousMobileRequest(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false;
  if (EXPO_RE.test(p) || ANDROID_NATIVE_RE.test(p)) return false;
  return MOBILE_GENERIC_RE.test(p) || /\b(app de voz|voice app|hermes)\b/i.test(p);
}


