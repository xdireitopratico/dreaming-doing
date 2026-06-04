import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VITE_REACT_SEED } from "@/lib/seeds/vite-react";
import { inferStackFromPrompt } from "@/lib/stack-router";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "projeto";
}

function nameFromPrompt(p: string) {
  const first = p.split(/[.\n]/)[0].trim();
  return first.length > 60 ? first.slice(0, 57) + "…" : first || "Novo projeto";
}

export const createProjectFromPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ prompt: z.string().min(1).max(8000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = nameFromPrompt(data.prompt);
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;
    const stack = inferStackFromPrompt(data.prompt);

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .insert({
        owner_id: userId,
        name,
        slug,
        description: data.prompt.slice(0, 280),
        template: stack.id,
        meta: {
          stackLabel: stack.label,
          stackReason: stack.reason,
        },
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    // Seed: Vite + React + Tailwind 4. 10 arquivos.
    const seedRows = VITE_REACT_SEED.map((f) => ({
      project_id: project.id,
      path: f.path,
      content: f.content,
    }));
    const { error: fErr } = await supabase.from("project_files").insert(seedRows);
    if (fErr) throw new Error(`Falha ao semear arquivos: ${fErr.message}`);

    const { data: conv, error: cErr } = await supabase
      .from("conversations")
      .insert({ project_id: project.id, title: name })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    const { error: mErr } = await supabase.from("messages").insert({
      conversation_id: conv.id,
      role: "user",
      parts: [{ type: "text", text: data.prompt }],
      tool_calls: [],
    });
    if (mErr) throw new Error(mErr.message);

    return { projectId: project.id as string, conversationId: conv.id as string };
  });
