import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell } from "@/components/MarketingShell";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/projects/")({
  component: () => (
    <MarketingShell requireAuth>
      <ProjectsList />
    </MarketingShell>
  ),
});

function ProjectsList() {
  const { data } = useQuery({
    queryKey: ["projects-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="px-6 py-12 max-w-[1120px] mx-auto">
      <h1 className="font-display text-4xl md:text-5xl mb-2">Seus projetos</h1>
      <p className="text-muted-foreground text-sm mb-10">
        Tudo o que você construiu até agora.
      </p>
      {data && data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}>
              <Card className="p-4 hover:border-primary/50 transition-colors h-full bg-surface/40">
                <div
                  className="aspect-video rounded-md mb-3 grid place-items-center border border-border"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <Sparkles className="size-6 text-primary/60" />
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
        <Card className="p-12 text-center border-dashed bg-surface/30">
          <p className="text-sm text-muted-foreground">
            Nenhum projeto ainda. Volte para a home e comece com um prompt.
          </p>
        </Card>
      )}
    </div>
  );
}
