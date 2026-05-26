import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, RequireAuth } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/projects/")({
  component: () => <RequireAuth><AppShell><ProjectsList /></AppShell></RequireAuth>,
});

function ProjectsList() {
  const { data } = useQuery({
    queryKey: ["projects-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Todos os projetos</h1>
      {data && data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }}>
              <Card className="p-4 hover:border-primary/50 transition-colors h-full">
                <div className="aspect-video rounded-md bg-gradient-to-br from-muted to-muted/50 mb-3 grid place-items-center">
                  <Sparkles className="size-6 opacity-40" />
                </div>
                <h3 className="font-medium truncate">{p.name}</h3>
                <p className="text-xs text-muted-foreground truncate mt-1">{p.description ?? "Sem descrição"}</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum projeto. Volte para a home e crie o primeiro.</p>
      )}
    </div>
  );
}
