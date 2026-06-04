import { useState } from "react";
import { Github, Database, Cloud, CheckCircle2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlatformConnectorId, PlatformConnectorStatus } from "@/hooks/usePlatformConnectors";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";

const META: Record<
  PlatformConnectorId,
  { title: string; description: string; icon: React.ReactNode; tokenLabel?: string; tokenPlaceholder?: string }
> = {
  github: {
    title: "GitHub",
    description: "Importe repositórios e sincronize código. Token opcional para repos privados.",
    icon: <Github className="size-5" />,
    tokenLabel: "Personal Access Token",
    tokenPlaceholder: "ghp_...",
  },
  supabase: {
    title: "Supabase",
    description: "Projeto próprio: URL e chave anon nas variáveis do deploy.",
    icon: <Database className="size-5" />,
  },
  vercel: {
    title: "Vercel",
    description: "Publique com seu token e projeto Vercel.",
    icon: <Cloud className="size-5" />,
    tokenLabel: "Access Token",
    tokenPlaceholder: "vca_...",
  },
  cloudflare: {
    title: "Cloudflare Pages",
    description: "Token da API Cloudflare para deploy em edge.",
    icon: <Cloud className="size-5" />,
    tokenLabel: "API Token",
    tokenPlaceholder: "cf_...",
  },
};

interface PlatformConnectorModalProps {
  connector: PlatformConnectorId | null;
  status: PlatformConnectorStatus | null;
  onClose: () => void;
  onSave: (
    kind: PlatformConnectorId,
    payload: { token?: string; meta?: Record<string, unknown>; disconnect?: boolean },
  ) => Promise<void>;
}

export function PlatformConnectorModal({
  connector,
  status,
  onClose,
  onSave,
}: PlatformConnectorModalProps) {
  const [token, setToken] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [vercelProject, setVercelProject] = useState("");
  const [cfAccount, setCfAccount] = useState("");
  const [busy, setBusy] = useState(false);

  if (!connector) return null;

  const meta = META[connector];
  const connected = status?.connected ?? false;

  const handleConnect = async () => {
    setBusy(true);
    try {
      if (connector === "github") {
        await onSave("github", {
          token: token || undefined,
          meta: {
            githubUsername: githubUser.trim() || undefined,
            label: githubUser.trim() ? `@${githubUser.trim()}` : "GitHub",
          },
        });
      } else if (connector === "vercel") {
        if (!token.trim()) return;
        await onSave("vercel", {
          token: token.trim(),
          meta: {
            projectName: vercelProject.trim() || "dreaming-doing",
            label: vercelProject.trim() || undefined,
          },
        });
      } else if (connector === "cloudflare") {
        if (!token.trim()) return;
        await onSave("cloudflare", {
          token: token.trim(),
          meta: {
            accountId: cfAccount.trim() || undefined,
            label: cfAccount.trim() || "Cloudflare",
          },
        });
      } else {
        await onSave("supabase", {});
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (connector === "supabase") {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await onSave(connector, { disconnect: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!connector} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-[var(--border)] bg-[var(--surface-1)] text-[var(--foreground)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--primary)]">
              {meta.icon}
            </span>
            {meta.title}
            {connected && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                <CheckCircle2 className="size-3" />
                Conectado
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-dim)]">{meta.description}</DialogDescription>
        </DialogHeader>

        {connector === "supabase" ? (
          <div className="space-y-3 py-2 text-sm text-[var(--text-dim)]">
            <p>
              Modo FORGE: já usa <code className="text-xs">dpduljngdurfpmaclffa</code>. Modo próprio: defina{" "}
              <code className="text-xs">VITE_SUPABASE_URL</code> e{" "}
              <code className="text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code> na Vercel.
            </p>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
            >
              Abrir Supabase Dashboard
              <ExternalLink className="size-3" />
            </a>
          </div>
        ) : connected ? (
          <div className="py-2 text-sm text-[var(--text-dim)]">
            {status?.label && (
              <p>
                Conta: <strong className="text-[var(--foreground)]">{status.label}</strong>
              </p>
            )}
            <p className="text-xs mt-2">Desconecte para trocar credenciais.</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {connector === "github" && (
              <div className="space-y-2">
                <Label>Usuário GitHub (opcional)</Label>
                <Input value={githubUser} onChange={(e) => setGithubUser(e.target.value)} placeholder="seu-usuario" />
              </div>
            )}
            {connector === "vercel" && (
              <div className="space-y-2">
                <Label>Nome do projeto Vercel</Label>
                <Input
                  value={vercelProject}
                  onChange={(e) => setVercelProject(e.target.value)}
                  placeholder="dreaming-doing"
                />
              </div>
            )}
            {connector === "cloudflare" && (
              <div className="space-y-2">
                <Label>Account ID (opcional)</Label>
                <Input value={cfAccount} onChange={(e) => setCfAccount(e.target.value)} placeholder="account id" />
              </div>
            )}
            {meta.tokenLabel && (
              <ApiKeyInput
                label={meta.tokenLabel}
                value={token}
                onChange={setToken}
                provider={connector}
                placeholder={meta.tokenPlaceholder}
              />
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {connected && connector !== "supabase" ? (
            <Button type="button" variant="outline" onClick={handleDisconnect} disabled={busy}>
              Desconectar
            </Button>
          ) : connector !== "supabase" ? (
            <Button
              type="button"
              className="bg-[var(--primary)] text-[#0a0a0a]"
              onClick={handleConnect}
              disabled={busy || ((connector === "vercel" || connector === "cloudflare") && !token.trim())}
            >
              {busy ? "Conectando…" : "Conectar"}
            </Button>
          ) : (
            <Button type="button" onClick={onClose}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}