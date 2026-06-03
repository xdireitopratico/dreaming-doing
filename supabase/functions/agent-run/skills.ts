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
        description: "Projetos React + Tailwind + TypeScript",
        systemPrompt: `
## Stack Detectada: React + Tailwind + TypeScript

Use React 19 patterns, Tailwind CSS 4 com classes utilitárias, TypeScript com tipos estritos.
Componentes devem ser funcionais com hooks. Use o padrão de export default para páginas e named exports para componentes.
Prefira composição a herança. Use React.memo apenas quando necessário.`,
        tools: [],
        validate: (files) => files.some(f => f.path.includes("package.json")),
      },
      {
        name: "nextjs-app-router",
        description: "Projetos Next.js App Router",
        systemPrompt: `
## Stack Detectada: Next.js App Router

Use Server Components por padrão. Adicione 'use client' apenas quando necessário.
Use App Router patterns: layouts, loading, error, not-found.
Prefira Server Actions para mutations. Use o sistema de roteamento baseado em arquivos.`,
        tools: [],
        validate: (files) => files.some(f => f.path === "next.config.js" || f.path === "next.config.ts" || f.path === "next.config.mjs"),
      },
      {
        name: "supabase-backend",
        description: "Projetos com Supabase (Auth + DB + Storage)",
        systemPrompt: `
## Stack Detectada: Supabase Backend

Use o client Supabase para autenticação, queries e storage.
Sempre use Row Level Security (RLS) nas tabelas.
Use o padrão de service role apenas em Edge Functions, nunca no frontend.
Para queries complexas, prefira funções PostgreSQL via rpc.`,
        tools: [],
        validate: (files) => files.some(f => f.path.includes("supabase") || f.content?.includes("@supabase/supabase-js") || f.content?.includes("createClient")),
      },
      {
        name: "vite-react",
        description: "Projetos Vite + React",
        systemPrompt: `
## Stack Detectada: Vite + React

Use o Vite como bundler. Hot Module Replacement (HMR) é nativo.
Importe assets diretamente. Use import.meta.env para variáveis de ambiente.
O entry point é src/main.tsx. Configure aliases no vite.config.ts.`,
        tools: [],
        validate: (files) => files.some(f => f.path === "vite.config.ts" || f.path === "vite.config.js"),
      },
    ];
  }

  addSkill(skill: Skill): void {
    const existing = this.skills.findIndex(s => s.name === skill.name);
    if (existing >= 0) {
      this.skills[existing] = skill;
    } else {
      this.skills.push(skill);
    }
  }

  detectActive(files: FileEntry[]): Skill[] {
    return this.skills.filter(s => s.validate(files));
  }

  buildSkillPrompt(files: FileEntry[]): string {
    const active = this.detectActive(files);
    if (active.length === 0) return "";

    return active.map(s => s.systemPrompt).join("\n\n");
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
