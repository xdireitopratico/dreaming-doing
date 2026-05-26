import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell, RequireAuth } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Sparkles, ArrowUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: () => (
    <RequireAuth>
      <AppShell>
        <Home />
      </AppShell>
    </RequireAuth>
  ),
});

const SUGGESTIONS = [
  "Um app de tarefas com prioridades e tema escuro",
  "Landing page para uma cafeteria especialty",
  "Dashboard simples de finanças pessoais",
  "Portfólio minimalista com projetos em grid",
];

function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ["projects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const create = async () => {
    if (!prompt.trim() || !user) return;
    setCreating(true);
    try {
      const name = prompt.split("\n")[0].slice(0, 60) || "Novo projeto";
      const slug = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({ owner_id: user.id, name, slug, description: prompt.slice(0, 280) })
        .select()
        .single();
      if (pErr || !project) throw pErr ?? new Error("Falha ao criar projeto");

      const { data: conv, error: cErr } = await supabase
        .from("conversations")
        .insert({ project_id: project.id, title: name })
        .select()
        .single();
      if (cErr || !conv) throw cErr ?? new Error("Falha ao criar conversa");

      await supabase.from("messages").insert({
        conversation_id: conv.id,
        role: "user",
        parts: [{ type: "text", text: prompt }],
      });

      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar projeto");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-card/50 backdrop-blur text-xs text-muted-foreground mb-6">
              <Sparkles className="size-3" /> Construído com IA, infinitamente personalizável
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-tight">
              O que vamos <span className="bg-gradient-to-r from-primary via-fuchsia-500 to-orange-400 bg-clip-text text-transparent">construir</span> hoje?
            </h1>
            <p className="text-muted-foreground mt-4 text-lg">
              Descreva sua ideia e a IA gera um app completo, com preview ao vivo.
            </p>
          </div>

          <Card className="p-2 shadow-lg border-2 border-border/80 focus-within:border-primary/60 transition-colors">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) create();
              }}
              placeholder="Crie um app de…"
              className="min-h-28 border-0 focus-visible:ring-0 resize-none text-base shadow-none"
            />
            <div className="flex items-center justify-between p-2">
              <div className="text-xs text-muted-foreground">⌘+Enter para enviar</div>
              <Button onClick={create} disabled={!prompt.trim() || creating} size="sm">
                {creating ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                <span className="ml-1">Construir</span>
              </Button>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2 justify-center mt-6">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                className="text-xs px-3 py-1.5 rounded-full border bg-card/50 hover:bg-accent transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="border-t bg-muted/20 px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Seus projetos</h2>
            <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">Ver todos →</Link>
          </div>
          {projects && projects.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.slice(0, 6).map((p) => (
                <Link
                  key={p.id}
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="group"
                >
                  <Card className="p-4 hover:border-primary/50 transition-colors h-full">
                    <div className="aspect-video rounded-md bg-gradient-to-br from-muted to-muted/50 mb-3 grid place-items-center text-muted-foreground">
                      <Sparkles className="size-6 opacity-40" />
                    </div>
                    <h3 className="font-medium truncate">{p.name}</h3>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {p.description ?? "Sem descrição"}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="p-10 text-center border-dashed">
              <Plus className="size-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum projeto ainda. Comece com um prompt acima.</p>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
