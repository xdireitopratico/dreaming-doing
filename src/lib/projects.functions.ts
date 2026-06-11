import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { seedForStack } from "@/lib/seeds";
import { inferStackFromPrompt, type ProjectStackId } from "@/lib/stack-router";

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "projeto"
  );
}

function nameFromPrompt(p: string) {
  const first = p.split(/[.\n]/)[0].trim();
  return first.length > 60 ? first.slice(0, 57) + "…" : first || "Novo projeto";
}

const VITE_STACK: ReturnType<typeof inferStackFromPrompt> = {
  id: "vite-react",
  label: "Vite + React 19 + TypeScript + Tailwind v4",
  reason: "Stack web padrão FORGE — UI rica, preview ao vivo, design system.",
};

function stackFromTemplate(templateId?: string): ReturnType<typeof inferStackFromPrompt> | null {
  if (!templateId) return null;
  if (
    templateId === "vite-react" ||
    templateId === "landing-page" ||
    templateId === "dashboard" ||
    templateId === "fullstack-supabase"
  ) {
    return {
      ...VITE_STACK,
      reason:
        templateId === "vite-react"
          ? "Template React + Vite."
          : `Template ${templateId} — seed padrão FORGE.`,
    };
  }
  if (templateId === "expo") {
    return {
      id: "expo",
      label: "Expo + React Native (web + celular)",
      reason: "Template Expo — preview web + mobile.",
    };
  }
  if (templateId === "android-native") {
    return {
      id: "android-native",
      label: "Android nativo (Kotlin/Gradle)",
      reason: "Template Android nativo.",
    };
  }
  const known: ProjectStackId[] = ["node-api", "static-html", "custom"];
  if (known.includes(templateId as ProjectStackId)) {
    return inferStackFromPrompt(`scaffold ${templateId}`);
  }
  return null;
}

const createProjectInputSchema = z
  .object({
    prompt: z.string().max(8000).optional(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    template: z.string().max(64).optional(),
    firstPrompt: z.string().max(8000).optional(),
  })
  .refine((d) => Boolean(d.prompt?.trim() || d.name?.trim()), {
    message: "Informe o prompt ou o nome do projeto",
  });

export const createProjectFromPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createProjectInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const promptText =
      data.prompt?.trim() || data.firstPrompt?.trim() || data.description?.trim() || "";
    const projectName = data.name?.trim() || nameFromPrompt(promptText);
    const slug = `${slugify(projectName)}-${Math.random().toString(36).slice(2, 7)}`;
    const stack =
      stackFromTemplate(data.template) ?? inferStackFromPrompt(promptText || projectName);
    const description =
      data.description?.trim() ||
      (data.prompt?.trim() ? data.prompt.trim().slice(0, 280) : promptText.slice(0, 280));

    const userMessageText =
      data.firstPrompt?.trim() ||
      data.prompt?.trim() ||
      promptText ||
      `Iniciar projeto: ${projectName}`;

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .insert({
        owner_id: userId,
        name: projectName,
        slug,
        description: description || null,
        template: data.template?.trim() || stack.id,
        meta: {
          stackLabel: stack.label,
          stackReason: stack.reason,
        },
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const seedFiles = seedForStack(stack.id);
    const seedRows = seedFiles.map((f) => ({
      project_id: project.id,
      path: f.path,
      content: f.content,
    }));
    const { error: fErr } = await supabase.from("project_files").insert(seedRows);
    if (fErr) throw new Error(`Falha ao semear arquivos: ${fErr.message}`);

    const { data: conv, error: cErr } = await supabase
      .from("conversations")
      .insert({ project_id: project.id, title: projectName })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    const { error: mErr } = await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "user",
      parts: [{ type: "text", text: userMessageText }],
      tool_calls: [],
    });
    if (mErr) throw new Error(mErr.message);

    return { projectId: project.id as string, conversationId: conv.id as string };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", data.projectId)
      .single();

    if (!project || project.owner_id !== userId) {
      throw new Error("Projeto não encontrado.");
    }

    const { data: res, error } = await supabase.functions.invoke("project-delete", {
      body: { projectId: data.projectId },
    });

    if (error) throw new Error(error.message);
    const body = res as { error?: string };
    if (body?.error) throw new Error(body.error);

    return { ok: true as const };
  });
