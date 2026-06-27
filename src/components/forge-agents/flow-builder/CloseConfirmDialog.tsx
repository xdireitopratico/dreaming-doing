/**
 * CloseConfirmDialog — Confirmacao ao fechar o editor com alteracoes nao salvas.
 *
 * 3 opcoes:
 *  - "Sair sem salvar" (descartar)
 *  - "Salvar e sair"
 *  - "Cancelar" (fica no editor)
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type CloseAction = "discard" | "save_and_close";

interface CloseConfirmDialogProps {
  open: boolean;
  onConfirm: (action: CloseAction) => void;
  onCancel: () => void;
}

export function CloseConfirmDialog({ open, onConfirm, onCancel }: CloseConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
          <AlertDialogDescription>
            Voce tem alteracoes nao salvas. Se sair agora, elas serao perdidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm("discard")}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Sair sem salvar
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => onConfirm("save_and_close")}
          >
            Salvar e sair
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
