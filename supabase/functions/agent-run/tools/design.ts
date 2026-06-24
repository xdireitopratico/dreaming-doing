// tools/design.ts — design_resolve, design_validate, design_inventory
import type { ToolRegistry } from "../registry.ts";
import type { ToolResult } from "../types.ts";
import { buildDesignManifestSummary } from "../design-manifest.ts";
import { resolveDesignPackage, type DesignResolveInput } from "../design-resolve.ts";
import { validateDesignImplementation } from "../design-validate.ts";

function ok(output: unknown): ToolResult {
  return { toolCallId: "", ok: true, output };
}

function fail(error: string): ToolResult {
  return { toolCallId: "", ok: false, error, output: null };
}

export function registerDesignTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "design_resolve",
      description:
        "Resolve pacote de design determinístico para o domínio (composições, técnicas, DNA, read_paths). " +
        "Use no Plan antes de create_plan.design ou no início do Build UI.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domínio/pedido do usuário (ex: padaria artesanal)" },
          mood_override: { type: "string", description: "Mood opcional (ember, ocean, ...)" },
          exclude_voices: { type: "array", items: { type: "string" } },
          exclude_techniques: { type: "array", items: { type: "string" } },
          rotation_key: { type: "string", description: "Chave para variar composição entre projetos" },
        },
        required: ["domain"],
      },
    },
    async (args) => {
      const domain = typeof args.domain === "string" ? args.domain.trim() : "";
      if (!domain) return fail("design_resolve requer domain");
      const input: DesignResolveInput = {
        domain,
        moodOverride: typeof args.mood_override === "string" ? args.mood_override : undefined,
        excludeVoices: Array.isArray(args.exclude_voices)
          ? (args.exclude_voices as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
        excludeTechniques: Array.isArray(args.exclude_techniques)
          ? (args.exclude_techniques as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
        rotationKey: typeof args.rotation_key === "string" ? args.rotation_key : undefined,
      };
      const pkg = resolveDesignPackage(input);
      return ok({
        ...pkg,
        design_field: {
          voice: pkg.proposal.voice,
          moment: pkg.proposal.moment,
          techniques: pkg.techniques,
          mood: pkg.proposal.mood,
          compositions: pkg.compositions,
          relevant_dnas: pkg.relevant_dnas,
          read_paths: pkg.read_paths,
          anti_patterns: pkg.anti_patterns,
          synthesis_reasoning: pkg.proposal.reasoning,
        },
      });
    },
  );

  reg.register(
    {
      name: "design_validate",
      description: "Valida se o código implementa o pacote de design aprovado (assinaturas craft).",
      parameters: {
        type: "object",
        properties: {
          compositions: { type: "array", items: { type: "string" } },
          composition_exports: { type: "array", items: { type: "string" } },
          techniques: { type: "array", items: { type: "string" } },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: { path: { type: "string" }, content: { type: "string" } },
            },
          },
        },
        required: ["compositions", "techniques"],
      },
    },
    async (args) => {
      const compositions = Array.isArray(args.compositions)
        ? (args.compositions as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const techniques = Array.isArray(args.techniques)
        ? (args.techniques as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const composition_exports = Array.isArray(args.composition_exports)
        ? (args.composition_exports as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const fileMap = new Map<string, string>();
      if (Array.isArray(args.files)) {
        for (const f of args.files as Record<string, unknown>[]) {
          const path = typeof f.path === "string" ? f.path : "";
          const content = typeof f.content === "string" ? f.content : "";
          if (path) fileMap.set(path, content);
        }
      }
      const result = validateDesignImplementation({
        expected: { compositions, techniques, composition_exports },
        files: fileMap,
      });
      return ok(result);
    },
  );

  reg.register(
    {
      name: "design_inventory",
      description: "Retorna resumo do design manifest (catálogo verdadeiro @forge/ui).",
      parameters: { type: "object", properties: {} },
    },
    async () => ok({ summary: buildDesignManifestSummary() }),
  );
}