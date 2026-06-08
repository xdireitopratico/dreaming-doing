import { useState } from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
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
import type { ConnectorId, ConnectorStatus } from "@/hooks/useConnectors";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";

type Variant = "dashboard" | "editor";

const ICONS: Record<ConnectorId, React.ReactNode> = {
  github: <span className="text-lg font-bold">GH</span>,
  supabase: <span className="text-lg">⚡</span>,
  vercel: <span className="text-lg">▲</span>,
  netlify: <span className="text-lg font-bold">N</span>,
  cloudflare: <span className="text-lg">☁</span>,
  e2b: <span className="text-lg font-mono">SB</span>,
};

interface ConnectorGuideModalProps {
  connector: ConnectorId | null;
  status: ConnectorStatus | null;
  variant?: Variant;
  onClose: () => void;
  onSave: (
    kind: ConnectorId,
    payload: { token?: string; meta?: Record<string, unknown>; disconnect?: boolean },
  ) => Promise<void>;
}

export function ConnectorGuideModal({
  connector,
  status,
  variant = "dashboard",
  onClose,
  onSave,
}: ConnectorGuideModalProps) {
  const [token, setToken] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [vercelProject, setVercelProject] = useState("");
  const [cfAccount, setCfAccount] = useState("");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [busy, setBusy] = useState(false);

  if (!connector || !status) return null;

  const entry = CONNECTOR_REGISTRY[connector];
  const connected = status.connected;
  const isEditor = variant === "editor";

  const panelClass = isEditor
    ? "border-[var(--forge-border-strong)] bg-[var(--forge-surface-2)] text-[var(--forge-text)]"
    : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--foreground)]";

  const mutedClass = isEditor ? "text-[var(--forge-muted)]" : "text-[var(--text-dim)]";
  const silverClass = isEditor ? "text-[var(--forge-silver)]" : "text-[var(--text-dim)]";

  const resetAndClose = () => {
    setToken("");
    onClose();
  };

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
        if (!token.trim()) {
          toast.error("Token Vercel obrigatório");
          return;
        }
        await onSave("vercel", {
          token: token.trim(),
          meta: {
            projectName: vercelProject.trim() || "meu-projeto",
            label: vercelProject.trim() || undefined,
          },
        });
      } else if (connector === "cloudflare") {
        if (!token.trim()) {
          toast.error("Token Cloudflare obrigatório");
          return;
        }
        await onSave("cloudflare", {
          token: token.trim(),
          meta: {
            accountId: cfAccount.trim() || undefined,
            label: cfAccount.trim() || "Cloudflare",
          },
        });
      } else if (connector === "e2b") {
        resetAndClose();
        window.location.assign("/api#forge-key-e2b");
      } else if (connector === "supabase") {
        if (!supabaseUrl.trim() || !token.trim()) {
          toast.error("Informe a URL do projeto e a chave anon ou service role");
          return;
        }
        await onSave("supabase", {
          token: token.trim(),
          meta: {
            projectUrl: supabaseUrl.trim(),
            label: "Supabase",
          },
        });
      } else {
        await onSave(connector, { token: token.trim() });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await onSave(connector, { disconnect: true });
    } finally {
      setBusy(false);
    }
  };

  const signupLink = (
    <a
      href={entry.signupUrl}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 text-sm ${isEditor ? "text-[var(--forge-primary)]" : "text-[var(--primary)]"} hover:underline`}
    >
      Criar conta no {entry.name}
      <ExternalLink className="size-3" />
    </a>
  );

  const needsToken = !!entry.upsertKind;

  return (
    <Dialog open={!!connector} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent
        className={`${panelClass} sm:max-w-md${isEditor ? " z-[260] border-[var(--forge-border-strong)] bg-[var(--forge-surface-2)] text-[var(--forge-text)]" : ""}`}
      >
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isEditor ? "text-[var(--forge-text)]" : ""}`}>
            <span
              className={`grid size-9 place-items-center rounded-lg ${
                isEditor
                  ? "bg-[var(--forge-surface-3)] text-[var(--forge-primary)]"
                  : "bg-[var(--surface-2)] text-[var(--primary)]"
              }`}
            >
              {ICONS[connector]}
            </span>
            {entry.name}
            {connected && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                <CheckCircle2 className="size-3" />
                Conectado
              </span>
            )}
          </DialogTitle>
          <DialogDescription className={mutedClass}>{entry.tagline}</DialogDescription>
        </DialogHeader>

        {entry.costNote && (
          <p className={`text-[10px] leading-relaxed ${silverClass}`}>{entry.costNote}</p>
        )}

        <div className={`space-y-3 py-2 text-sm ${silverClass}`}>
          <p>{entry.description}</p>
          {!connected && signupLink}
          {entry.docsUrl && (
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noreferrer"
              className={`block text-xs ${isEditor ? "text-[var(--forge-primary)]" : "text-[var(--primary)]"} hover:underline`}
            >
              Ver documentação
            </a>
          )}
        </div>

        {connected ? (
          <div className={`py-2 text-sm ${silverClass}`}>
            {status.label && (
              <p>
                Conta:{" "}
                <strong className={isEditor ? "text-[var(--forge-text)]" : "text-[var(--foreground)]"}>
                  {status.label}
                </strong>
              </p>
            )}
            <p className="text-xs mt-2">Desconecte para trocar credenciais.</p>
          </div>
        ) : needsToken ? (
          <div className="space-y-4 py-2">
            {connector === "github" && (
              <div className="space-y-2">
                <Label className={mutedClass}>Usuário GitHub</Label>
                <Input
                  value={githubUser}
                  onChange={(e) => setGithubUser(e.target.value)}
                  placeholder="seu-usuario"
                  className={isEditor ? "border-[var(--forge-border-strong)] bg-[var(--forge-surface-3)]" : ""}
                />
              </div>
            )}
            {connector === "vercel" && (
              <div className="space-y-2">
                <Label className={mutedClass}>Nome do projeto Vercel</Label>
                <Input
                  value={vercelProject}
                  onChange={(e) => setVercelProject(e.target.value)}
                  placeholder="meu-app"
                  className={isEditor ? "border-[var(--forge-border-strong)] bg-[var(--forge-surface-3)]" : ""}
                />
              </div>
            )}
            {connector === "cloudflare" && (
              <div className="space-y-2">
                <Label className={mutedClass}>Account ID (opcional)</Label>
                <Input
                  value={cfAccount}
                  onChange={(e) => setCfAccount(e.target.value)}
                  placeholder="account id"
                  className={isEditor ? "border-[var(--forge-border-strong)] bg-[var(--forge-surface-3)]" : ""}
                />
              </div>
            )}
            {connector === "supabase" && (
              <div className="space-y-2">
                <Label className={mutedClass}>URL do projeto</Label>
                <Input
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                  className={isEditor ? "border-[var(--forge-border-strong)] bg-[var(--forge-surface-3)]" : ""}
                />
              </div>
            )}
            {entry.tokenLabel && (
              <ApiKeyInput
                label={entry.tokenLabel}
                value={token}
                onChange={setToken}
                provider={connector === "cloudflare" ? "cloudflare" : connector}
                placeholder={entry.tokenPlaceholder}
              />
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2 flex-col sm:flex-row sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            {connected ? (
              <Button type="button" variant="outline" onClick={handleDisconnect} disabled={busy}>
                Desconectar
              </Button>
            ) : needsToken ? (
              <Button
                type="button"
                className={isEditor ? "bg-[var(--forge-primary)] text-[#0a0a0a]" : "bg-[var(--primary)] text-[#0a0a0a]"}
                onClick={handleConnect}
                disabled={
                  busy ||
                  ((connector === "vercel" ||
                    connector === "netlify" ||
                    connector === "cloudflare" ||
                    connector === "supabase") &&
                    !token.trim()) ||
                  (connector === "supabase" && !supabaseUrl.trim())
                }
              >
                {busy ? "Conectando…" : "Salvar conexão"}
              </Button>
            ) : null}
          </div>
          <Button type="button" variant="ghost" onClick={resetAndClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}