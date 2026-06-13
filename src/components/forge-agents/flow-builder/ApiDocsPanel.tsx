/**
 * ApiDocsPanel — Interactive API documentation for AetherForge
 * R55: Developer experience with code snippets (curl, JS, Python)
 * Max: 200 lines (anti-monolithic)
 */
import { useState } from "react";
import { X, Copy, Check, Code, Terminal, Globe, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";

interface ApiDocsPanelProps {
  onClose: () => void;
}

const BASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID || "PROJECT_ID"}.supabase.co/functions/v1`;

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  auth: string;
  body?: Record<string, string>;
  response: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/aetherforge-api-proxy",
    title: "API Info & Health",
    description: "Retorna informações da API, versão e rate limits.",
    auth: "Nenhuma",
    response: `{ "api": "AetherForge Public API", "version": "1.0", "rate_limit": "60 requests/minute" }`,
  },
  {
    method: "POST",
    path: "/aetherforge-api-proxy",
    title: "Execute Agent",
    description: "Executa um agente pelo slug. Retorna a resposta do fluxo completo.",
    auth: "X-API-Key ou Bearer JWT",
    body: { slug: "meu-agente", message: "Olá, como funciona?", session_id: "(opcional) uuid", channel: "(opcional) api|web|whatsapp" },
    response: `{ "execution_id": "uuid", "response": "Resposta do agente...", "steps": [...], "cost_cents": 0.12 }`,
  },
  {
    method: "POST",
    path: "/aetherforge-webhook-worker",
    title: "Webhook Trigger",
    description: "Dispara um fluxo via webhook externo. Requer header X-Flow-Id.",
    auth: "X-Flow-Id + HMAC (opcional)",
    body: { event: "order.created", data: "{ ... }" },
    response: `{ "status": "queued", "inbox_id": "uuid" }`,
  },
  {
    method: "POST",
    path: "/aetherforge-gdpr",
    title: "LGPD/GDPR — Data Management",
    description: "Exportar ou excluir dados do tenant. Requer JWT autenticado.",
    auth: "Bearer JWT",
    body: { action: "summary | export | delete" },
    response: `{ "action": "summary", "data": { "flows": 5, "executions": 120 } }`,
  },
];

function generateCurl(ep: Endpoint): string {
  const headers = ep.auth.includes("X-API-Key")
    ? `-H "X-API-Key: YOUR_API_KEY"`
    : ep.auth === "Nenhuma" ? "" : `-H "Authorization: Bearer YOUR_JWT"`;
  const body = ep.body ? ` \\\n  -d '${JSON.stringify(Object.fromEntries(Object.entries(ep.body).filter(([,v]) => !v.startsWith("(opcional)"))), null, 2)}'` : "";
  return `curl -X ${ep.method} "${BASE_URL}${ep.path}" \\\n  -H "Content-Type: application/json" \\\n  ${headers}${body}`;
}

function generateJS(ep: Endpoint): string {
  const bodyObj = ep.body ? Object.fromEntries(Object.entries(ep.body).filter(([,v]) => !v.startsWith("(opcional)"))) : null;
  const headers = ep.auth.includes("X-API-Key")
    ? `"X-API-Key": "YOUR_API_KEY",`
    : ep.auth === "Nenhuma" ? "" : `"Authorization": "Bearer YOUR_JWT",`;
  return `const res = await fetch("${BASE_URL}${ep.path}", {
  method: "${ep.method}",
  headers: {
    "Content-Type": "application/json",
    ${headers}
  },${bodyObj ? `\n  body: JSON.stringify(${JSON.stringify(bodyObj, null, 4)}),` : ""}
});
const data = await res.json();
console.log(data);`;
}

function generatePython(ep: Endpoint): string {
  const bodyObj = ep.body ? Object.fromEntries(Object.entries(ep.body).filter(([,v]) => !v.startsWith("(opcional)"))) : null;
  const headers = ep.auth.includes("X-API-Key")
    ? `"X-API-Key": "YOUR_API_KEY",`
    : ep.auth === "Nenhuma" ? "" : `"Authorization": "Bearer YOUR_JWT",`;
  return `import requests

res = requests.${ep.method.toLowerCase()}(
    "${BASE_URL}${ep.path}",
    headers={
        "Content-Type": "application/json",
        ${headers}
    },${bodyObj ? `\n    json=${JSON.stringify(bodyObj, null, 4)},` : ""}
)
print(res.json())`;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  ;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: "Copiado!" });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted/50 border rounded-lg p-3 text-xs overflow-x-auto font-mono whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
      <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={copy}>
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

export function ApiDocsPanel({ onClose }: ApiDocsPanelProps) {
  return (
    <div className="w-[480px] border-l bg-background flex flex-col shrink-0 h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">API Documentation</h3>
          <Badge variant="outline" className="text-xs">v1.0</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="p-4 border-b bg-muted/30 text-xs space-y-1">
        <div className="flex items-center gap-2"><Globe className="h-3 w-3" /><span className="font-mono text-muted-foreground break-all">{BASE_URL}</span></div>
        <div className="flex items-center gap-2"><Key className="h-3 w-3" /><span>Auth: <code className="bg-muted px-1 rounded">X-API-Key</code> ou <code className="bg-muted px-1 rounded">Bearer JWT</code></span></div>
        <div className="flex items-center gap-2"><Terminal className="h-3 w-3" /><span>Rate Limit: 60 req/min por tenant</span></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {ENDPOINTS.map((ep, i) => (
          <div key={i} className="border rounded-lg overflow-hidden">
            <div className="p-3 bg-muted/20 border-b flex items-center gap-2">
              <Badge variant={ep.method === "GET" ? "secondary" : "default"} className="text-xs font-mono">{ep.method}</Badge>
              <code className="text-xs font-mono">{ep.path}</code>
            </div>
            <div className="p-3 space-y-3">
              <div>
                <h4 className="font-medium text-sm">{ep.title}</h4>
                <p className="text-xs text-muted-foreground mt-1">{ep.description}</p>
                <p className="text-xs mt-1"><span className="text-muted-foreground">Auth:</span> {ep.auth}</p>
              </div>

              {ep.body && (
                <div>
                  <p className="text-xs font-medium mb-1">Body Parameters:</p>
                  <div className="bg-muted/30 rounded p-2 space-y-1">
                    {Object.entries(ep.body).map(([k, v]) => (
                      <div key={k} className="text-xs flex gap-2">
                        <code className="text-primary font-mono">{k}</code>
                        <span className="text-muted-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Tabs defaultValue="curl" className="w-full">
                <TabsList className="h-7 p-0.5">
                  <TabsTrigger value="curl" className="text-xs h-6 px-2">cURL</TabsTrigger>
                  <TabsTrigger value="js" className="text-xs h-6 px-2">JavaScript</TabsTrigger>
                  <TabsTrigger value="python" className="text-xs h-6 px-2">Python</TabsTrigger>
                </TabsList>
                <TabsContent value="curl" className="mt-2"><CodeBlock code={generateCurl(ep)} lang="bash" /></TabsContent>
                <TabsContent value="js" className="mt-2"><CodeBlock code={generateJS(ep)} lang="javascript" /></TabsContent>
                <TabsContent value="python" className="mt-2"><CodeBlock code={generatePython(ep)} lang="python" /></TabsContent>
              </Tabs>

              <div>
                <p className="text-xs font-medium mb-1">Response:</p>
                <CodeBlock code={ep.response} lang="json" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
