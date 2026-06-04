/** Inferência leve de stack a partir do prompt (expandível com LLM depois). */

export type ProjectStackId = "vite-react" | "node-api" | "static-html" | "custom";

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

export function inferStackFromPrompt(prompt: string): StackDecision {
  const p = prompt.toLowerCase();

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

  if (/\b(python|django|flask|rust|go |golang|mobile nativo|swift|kotlin)\b/.test(p)) {
    return {
      id: "custom",
      label: "Stack sob medida",
      reason: "Tecnologia fora do seed padrão — agente usa shell_exec para scaffold adequado.",
    };
  }

  return DEFAULT;
}