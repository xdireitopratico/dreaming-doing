import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

export type RollbackRequest = {
  messageId: string;
  role: "user" | "assistant";
};

type ForgeRollbackFlowProps = {
  disabled?: boolean;
  onRollback: (
    messageId: string,
    role: "user" | "assistant",
  ) => Promise<{ ok: boolean; error?: string }>;
  children: (requestRollback: (req: RollbackRequest) => void) => React.ReactNode;
};

type LockPhase = "idle" | "running" | "done";

export function ForgeRollbackFlow({
  disabled = false,
  onRollback,
  children,
}: ForgeRollbackFlowProps) {
  const [confirm, setConfirm] = useState<RollbackRequest | null>(null);
  const [lockPhase, setLockPhase] = useState<LockPhase>("idle");
  const [lockError, setLockError] = useState<string | null>(null);

  const requestRollback = useCallback(
    (req: RollbackRequest) => {
      if (disabled || lockPhase === "running") return;
      setConfirm(req);
    },
    [disabled, lockPhase],
  );

  const closeConfirm = useCallback(() => {
    if (lockPhase === "running") return;
    setConfirm(null);
  }, [lockPhase]);

  const executeRollback = useCallback(async () => {
    if (!confirm || lockPhase === "running") return;

    const { messageId, role } = confirm;
    setConfirm(null);
    setLockPhase("running");
    setLockError(null);

    try {
      const result = await onRollback(messageId, role);
      if (!result.ok) {
        const err = result.error ?? "Rollback falhou.";
        setLockError(err);
        setLockPhase("done");
        toast.error(err);
        return;
      }
      toast.success("Rollback concluído.");
      setLockPhase("idle");
      setLockError(null);
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : "Rollback falhou.";
      setLockError(err);
      setLockPhase("done");
      toast.error(err);
    }
  }, [confirm, lockPhase, onRollback]);

  const dismissLock = useCallback(() => {
    setLockPhase("idle");
    setLockError(null);
  }, []);

  return (
    <>
      {children(requestRollback)}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && closeConfirm()}>
        <DialogContent className="max-w-sm" data-testid="forge-rollback-confirm">
          <DialogHeader>
            <DialogTitle>Confirmar rollback?</DialogTitle>
            <DialogDescription>
              Remove esta mensagem e tudo que veio depois no chat. Se houver snapshot salvo,
              restaura os arquivos do projeto ao estado anterior. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={closeConfirm}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void executeRollback()}>
              Confirmar rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lockPhase !== "idle" && (
        <div
          className="forge-rollback-lock"
          role="alertdialog"
          aria-modal="true"
          aria-busy={lockPhase === "running"}
          data-testid="forge-rollback-lock"
        >
          <div className="forge-rollback-lock-card">
            {lockPhase === "running" ? (
              <>
                <Loader2 className="size-8 animate-spin text-[var(--text-accent)]" />
                <p className="forge-rollback-lock-title">Executando rollback…</p>
                <p className="forge-rollback-lock-desc">
                  Aguarde — a tela permanece bloqueada até concluir ou falhar.
                </p>
              </>
            ) : (
              <>
                <p className="forge-rollback-lock-title">Rollback falhou</p>
                <p className="forge-rollback-lock-desc">{lockError}</p>
                <Button type="button" size="sm" onClick={dismissLock}>
                  Fechar
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}