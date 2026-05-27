import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { Card } from "@/components/ui/card";
import { Github, Cloud, Plug, Database, Key } from "lucide-react";

export const Route = createFileRoute("/connectors")({
  component: () => (
    <MarketingShell requireAuth>
      <Connectors />
    </MarketingShell>
  ),
});

function Connectors() {
  const items = [
    { icon: Github, name: "GitHub", desc: "Sincronização bidirecional do código com seu repositório.", status: "Em breve" },
    { icon: Database, name: "Supabase próprio", desc: "Aponte para uma instância self-hosted sua.", status: "Em breve" },
    { icon: Key, name: "Chave de IA própria", desc: "Use sua chave Anthropic, OpenAI ou Gemini.", status: "Em breve" },
    { icon: Cloud, name: "Cloudflare Pages", desc: "Publique em edge global com um clique.", status: "Em breve" },
    { icon: Plug, name: "Servidores MCP", desc: "Conecte qualquer ferramenta via Model Context Protocol.", status: "Em breve" },
  ];
  return (
    <div className="px-6 py-12 max-w-[1120px] mx-auto">
      <h1 className="font-display text-4xl md:text-5xl mb-2">Conectores</h1>
      <p className="text-sm text-muted-foreground mb-10">Sua infra, suas ferramentas, plugadas aqui dentro.</p>
      <div className="grid gap-3">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Card key={it.name} className="p-4 flex items-center gap-4 bg-surface/40">
              <div className="size-10 rounded-md border border-border bg-background grid place-items-center">
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{it.name}</div>
                <div className="text-xs text-muted-foreground">{it.desc}</div>
              </div>
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border border-border text-muted-foreground">
                {it.status}
              </span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
