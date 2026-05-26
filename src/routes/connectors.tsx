import { createFileRoute } from "@tanstack/react-router";
import { AppShell, RequireAuth } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Github, Cloud, Plug } from "lucide-react";

export const Route = createFileRoute("/connectors")({
  component: () => <RequireAuth><AppShell><Connectors /></AppShell></RequireAuth>,
});

function Connectors() {
  const items = [
    { icon: Github, name: "GitHub", desc: "Sincronize seu código com um repositório.", status: "Em breve" },
    { icon: Cloud, name: "Vercel", desc: "Publique seu app com um clique.", status: "Em breve" },
    { icon: Cloud, name: "Cloudflare Pages", desc: "Hospede em edge global.", status: "Em breve" },
    { icon: Plug, name: "Servidor MCP", desc: "Conecte ferramentas externas via Model Context Protocol.", status: "Em breve" },
  ];
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Conectores</h1>
      <p className="text-sm text-muted-foreground mb-6">Integre serviços externos ao seu workspace.</p>
      <div className="grid gap-3">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Card key={it.name} className="p-4 flex items-center gap-4">
              <div className="size-10 rounded-md bg-muted grid place-items-center"><Icon className="size-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{it.name}</div>
                <div className="text-xs text-muted-foreground">{it.desc}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-muted">{it.status}</span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
