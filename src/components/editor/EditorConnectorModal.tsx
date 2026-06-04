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
import type { ConnectorId, ConnectorStatus } from "@/hooks/useEditorConnectors";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";

const META: Record<
  ConnectorId,
  { title: string; description: string; icon: React.ReactNode; tokenLabel?: string; tokenPlaceholder?: string }
> = {
  github: {
    title: "GitHub",
    description: "Importe repositórios e sincronize código com seus projetos FORGE.",
    icon: <Github className="size-5" />,
    tokenLabel: "Personal Access Token",
    tokenPlaceholder: "ghp_...",
  },
  supabase: {
    title: "Supabase",
    description:
      "Banco, auth e Edge Functions do projeto. Configurado via variáveis no deploy (Vercel/Lovable).",
    icon: <Database className="size-5" />,
  },
  vercel: {
    title: "Vercel",
    description: "Publique previews e produção automaticamente a cada push no Git.",
    icon: <Cloud className="size-5" />,
    tokenLabel: "Access Token",
    tokenPlaceholder: "vca_...",
  },
};

interface EditorConnectorModalProps {
  connector: ConnectorId | null;
  status: ConnectorStatus | null;
  onClose: () => void;
  onSave: (
    kind: ConnectorId,
    payload: { token?: string; meta?: Record<string, unknown>; disconnect?: boolean },
  ) => Promise<void>;
}

export function EditorConnectorModal({
  connector,
  status,
  onClose,
  onSave,
}: EditorConnectorModalProps) {
  const [token, setToken] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [vercelProject, setVercelProject] = useState("");
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
      <DialogContent className="border-[var(--forge-border-strong)] bg-[var(--forge-surface-2)] text-[var(--forge-text)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--forge-text)]">
            <span className="grid size-9 place-items-center rounded-lg bg-[var(--forge-surface-3)] text-[var(--forge-primary)]">
              {meta.icon}
            </span>
            {meta.title}
            {connected && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <CheckCircle2 className="size-3" />
                Conectado
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-[var(--forge-muted)]">
            {meta.description}
          </DialogDescription>
        </DialogHeader>

        {connector === "supabase" ? (
          <div className="space-y-3 py-2 text-sm text-[var(--forge-silver)]">
            {connected ? (
              <p>
                Supabase ativo neste ambiente. Projetos, mensagens e arquivos usam o mesmo backend.
              </p>
            ) : (
              <p>
                Adicione <code className="text-xs">VITE_SUPABASE_URL</code> e{" "}
                <code className="text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code> nas variáveis do
                deploy na Vercel.
              </p>
            )}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--forge-primary)] hover:underline"
            >
              Abrir Supabase Dashboard
              <ExternalLink className="size-3" />
            </a>
          </div>
        ) : connected ? (
          <div className="space-y-2 py-2">
            {status?.label && (
              <p className="text-sm text-[var(--forge-silver)]">
                Conta: <strong className="text-[var(--forge-text)]">{status.label}</strong>
              </p>
            )}
            <p className="text-xs text-[var(--forge-muted)]">
              Para trocar credenciais, desconecte e conecte novamente.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {connector === "github" && (
              <div className="space-y-2">
                <Label className="text-[var(--forge-muted)]">Usuário GitHub (opcional)</Label>
                <Input
                  value={githubUser}
                  onChange={(e) => setGithubUser(e.target.value)}
                  placeholder="seu-usuario"
                  className="border-[var(--forge-border-strong)] bg-[var(--forge-surface-3)]"
                />
              </div>
            )}
            {connector === "vercel" && (
              <div className="space-y-2">
                <Label className="text-[var(--forge-muted)]">Nome do projeto Vercel</Label>
                <Input
                  value={vercelProject}
                  onChange={(e) => setVercelProject(e.target.value)}
                  placeholder="dreaming-doing"
                  className="border-[var(--forge-border-strong)] bg-[var(--forge-surface-3)]"
                />
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
            {connector === "github" && (
              <p className="text-[10px] text-[var(--forge-muted)]">
                Token com escopo <code className="text-[var(--forge-silver)]">repo</code> para repos
                privados. Repos públicos podem ser importados sem token.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {connected && connector !== "supabase" ? (
            <Button
              type="button"
              variant="outline"
              className="border-[var(--forge-border-strong)]"
              onClick={handleDisconnect}
              disabled={busy}
            >
              Desconectar
            </Button>
          ) : connector !== "supabase" ? (
            <Button
              type="button"
              className="bg-[var(--forge-primary)] text-[#0a0a0a] hover:bg-[var(--forge-primary-hot)]"
              onClick={handleConnect}
              disabled={busy || (connector === "vercel" && !token.trim())}
            >
              {busy ? "Conectando…" : "Conectar"}
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-[var(--forge-primary)] text-[#0a0a0a]"
              onClick={onClose}
            >
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}