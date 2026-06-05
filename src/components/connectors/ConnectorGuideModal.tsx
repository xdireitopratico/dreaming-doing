import { useState } from "react";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import type { ConnectorId, ConnectorStatus, IntegrationMode } from "@/hooks/useConnectors";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import { ConnectorModeToggle } from "@/components/connectors/ConnectorModeToggle";
import { isConnectorActive } from "@/lib/connectors/registry";

type Variant = "dashboard" | "editor";

const ICONS: Record<ConnectorId, React.ReactNode> = {
  github: <span className="text-lg font-bold">GH</span>,
  supabase: <span className="text-lg">⚡</span>,
  vercel: <span className="text-lg">▲</span>,
  cloudflare: <span className="text-lg">☁</span>,
  e2b: <span className="text-lg font-mono">SB</span>,
};

interface ConnectorGuideModalProps {
  connector: ConnectorId | null;
  status: ConnectorStatus | null;
  mode: IntegrationMode;
  variant?: Variant;
  onClose: () => void;
  onSave: (
    kind: ConnectorId,
    payload: { token?: string; meta?: Record<string, unknown>; disconnect?: boolean },
  ) => Promise<void>;
  onModeChange: (mode: IntegrationMode) => void;
}

export function ConnectorGuideModal({
  connector,
  status,
  mode,
  variant = "dashboard",
  onClose,
  onSave,
  onModeChange,
}: ConnectorGuideModalProps) {
  const [token, setToken] = useState("");
  const [githubUser, setGithubUser] = useState("");
  const [vercelProject, setVercelProject] = useState("");
  const [cfAccount, setCfAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"choose" | "own-form">("choose");

  if (!connector || !status) return null;

  const entry = CONNECTOR_REGISTRY[connector];
  const connected = status.connected;
  const active = isConnectorActive(connector, mode, status);
  const isEditor = variant === "editor";

  const panelClass = isEditor
    ? "border-[var(--forge-border-strong)] bg-[var(--forge-surface-2)] text-[var(--forge-text)]"
    : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--foreground)]";

  const mutedClass = isEditor ? "text-[var(--forge-muted)]" : "text-[var(--text-dim)]";
  const silverClass = isEditor ? "text-[var(--forge-silver)]" : "text-[var(--text-dim)]";

  const resetAndClose = () => {
    setStep("choose");
    setToken("");
    onClose();
  };

  const handleConnectOwn = async () => {
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
            projectName: vercelProject.trim() || "meu-projeto",
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
      } else if (connector === "e2b") {
        await onSave("e2b", {});
      } else {
        await onSave("supabase", {});
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUseForge = async () => {
    setBusy(true);
    try {
      onModeChange("forge");
      if (connector === "e2b") {
        await onSave("e2b", {});
      } else if (connector === "supabase") {
        toast.success("Infraestrutura FORGE ativa — banco e auth prontos.");
        resetAndClose();
      } else {
        toast.success(`Modo FORGE ativo para ${entry.name}.`);
        resetAndClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (connector === "supabase" || connector === "e2b") {
      if (connector === "e2b") {
        setBusy(true);
        try {
          await onSave("e2b", { disconnect: true });
        } finally {
          setBusy(false);
        }
      } else {
        resetAndClose();
      }
      return;
    }
    setBusy(true);
    try {
      await onSave(connector, { disconnect: true });
      await onModeChange("forge");
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

  return (
    <Dialog open={!!connector} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className={`${panelClass} sm:max-w-md`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isEditor ? "text-[var(--forge-text)]" : ""}`}>
            <span
              className={`grid size-9 place-items-center rounded-lg ${
                isEditor ? "bg-[var(--forge-surface-3)] text-[var(--forge-primary)]" : "bg-[var(--surface-2)] text-[var(--primary)]"
              }`}
            >
              {ICONS[connector]}
            </span>
            {entry.name}
            {active && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                <CheckCircle2 className="size-3" />
                Ativo
              </span>
            )}
          </DialogTitle>
          <DialogDescription className={mutedClass}>{entry.tagline}</DialogDescription>
        </DialogHeader>

        <ConnectorModeToggle
          id={connector}
          mode={mode}
          forgeAvailable={status.forgeAvailable}
          onModeChange={onModeChange}
        />

        {entry.costNote && (
          <p className={`text-[10px] leading-relaxed ${silverClass}`}>{entry.costNote}</p>
        )}

        {connector === "supabase" && mode === "forge" ? (
          <div className={`space-y-3 py-2 text-sm ${silverClass}`}>
            <p>Banco, login e funções do FORGE já estão prontos — comece a construir sem configurar nada.</p>
            <p className="text-xs">
              Para usar seu próprio Supabase, altere para <strong>Meu Supabase</strong> e configure as variáveis no
              deploy.
            </p>
            {signupLink}
          </div>
        ) : connector === "e2b" && mode === "forge" ? (
          <div className={`space-y-3 py-2 text-sm ${silverClass}`}>
            <p>O preview ao vivo roda em sandbox gerenciado pelo FORGE (E2B).</p>
            {signupLink}
          </div>
        ) : connected && mode === "own" ? (
          <div className={`py-2 text-sm ${silverClass}`}>
            {status.label && (
              <p>
                Conta: <strong className={isEditor ? "text-[var(--forge-text)]" : "text-[var(--foreground)]"}>{status.label}</strong>
              </p>
            )}
            <p className="text-xs mt-2">Desconecte para voltar ao modo FORGE ou trocar credenciais.</p>
          </div>
        ) : step === "choose" ? (
          <div className={`space-y-4 py-2 text-sm ${silverClass}`}>
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
        ) : (
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
            {entry.tokenLabel && (
              <ApiKeyInput
                label={entry.tokenLabel}
                value={token}
                onChange={setToken}
                provider={connector === "cloudflare" ? "cloudflare" : connector}
                placeholder={entry.tokenPlaceholder}
              />
            )}
            {connector === "github" && (
              <p className={`text-[10px] ${mutedClass}`}>
                Token com escopo <code>repo</code> para repositórios privados.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-col sm:flex-row sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            {connected && mode === "own" && connector !== "supabase" ? (
              <Button type="button" variant="outline" onClick={handleDisconnect} disabled={busy}>
                Desconectar
              </Button>
            ) : step === "own-form" && mode === "own" && entry.upsertKind ? (
              <>
                <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={busy}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  className={isEditor ? "bg-[var(--forge-primary)] text-[#0a0a0a]" : "bg-[var(--primary)] text-[#0a0a0a]"}
                  onClick={handleConnectOwn}
                  disabled={
                    busy ||
                    ((connector === "vercel" || connector === "netlify" || connector === "cloudflare") &&
                      !token.trim())
                  }
                >
                  {busy ? "Conectando…" : "Salvar conexão"}
                </Button>
              </>
            ) : (
              <>
                {status.forgeAvailable && mode !== "forge" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1"
                    onClick={() => onModeChange("forge")}
                    disabled={busy}
                  >
                    <Sparkles className="size-3.5" />
                    Usar FORGE
                  </Button>
                )}
                {status.forgeAvailable && (
                  <Button
                    type="button"
                    className={isEditor ? "bg-[var(--forge-primary)] text-[#0a0a0a]" : "bg-[var(--primary)] text-[#0a0a0a]"}
                    onClick={handleUseForge}
                    disabled={busy}
                  >
                    {busy ? "…" : "Continuar com FORGE"}
                  </Button>
                )}
                {entry.upsertKind && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      onModeChange("own");
                      setStep("own-form");
                    }}
                    disabled={busy}
                  >
                    Conectar minha conta
                  </Button>
                )}
              </>
            )}
          </div>
          <Button type="button" variant="ghost" onClick={resetAndClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}