/**
 * useFlowShortcuts — Atalhos de teclado globais para o builder
 * Rodada 28: Keyboard Shortcuts + Accessibility
 */
import { useEffect, useCallback } from "react";

interface ShortcutActions {
  onSave: () => void;
  onPublish: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCommandPalette: () => void;
  onEscape: () => void;
  onToggleTest: () => void;
  onToggleDeploy: () => void;
  onToggleDebug: () => void;
  onSelectAll: () => void;
  onFitView: () => void;
  onToggleChat?: () => void;
}

interface UseFlowShortcutsOptions {
  enabled: boolean;
  actions: ShortcutActions;
}

export function useFlowShortcuts({ enabled, actions }: UseFlowShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      const mod = e.metaKey || e.ctrlKey;

      // Command palette — always active
      if (mod && e.key === "k") {
        e.preventDefault();
        actions.onCommandPalette();
        return;
      }

      // Escape — always active
      if (e.key === "Escape") {
        e.preventDefault();
        actions.onEscape();
        return;
      }

      // BUG 146 FIX: Save/Publish should work even in inputs (global shortcuts)
      // but other shortcuts should NOT fire in text inputs
      // Save — Ctrl/Cmd+S
      if (mod && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        actions.onSave();
        return;
      }

      // Publish — Ctrl/Cmd+Shift+P
      if (mod && e.shiftKey && e.key === "P") {
        e.preventDefault();
        actions.onPublish();
        return;
      }

      // Skip remaining shortcuts if in text input
      if (isInput) return;

      // Undo — Ctrl/Cmd+Z
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        actions.onUndo();
        return;
      }

      // Redo — Ctrl/Cmd+Shift+Z or Ctrl+Y
      if ((mod && e.shiftKey && e.key === "Z") || (mod && e.key === "y")) {
        e.preventDefault();
        actions.onRedo();
        return;
      }

      // Select All — Ctrl/Cmd+A
      if (mod && e.key === "a") {
        e.preventDefault();
        actions.onSelectAll();
        return;
      }

      // Fit view — Ctrl/Cmd+Shift+F
      if (mod && e.shiftKey && e.key === "F") {
        e.preventDefault();
        actions.onFitView();
        return;
      }

      // Copy — Ctrl/Cmd+C
      if (mod && e.key === "c" && !e.shiftKey) {
        e.preventDefault();
        actions.onCopy?.();
        return;
      }

      // Paste — Ctrl/Cmd+V
      if (mod && e.key === "v" && !e.shiftKey) {
        e.preventDefault();
        actions.onPaste?.();
        return;
      }

      // Toggle vibe chat — Ctrl/Cmd+Shift+L
      if (mod && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        actions.onToggleChat?.();
        return;
      }

      // Toggle panels with number keys (not in inputs)
      if (!isInput && !mod) {
        if (e.key === "1") { actions.onToggleTest(); return; }
        if (e.key === "2") { actions.onToggleDeploy(); return; }
        if (e.key === "3") { actions.onToggleDebug(); return; }
      }
    },
    [enabled, actions]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// Shortcut display helper
export const SHORTCUT_MAP = [
  { action: "Salvar", keys: "Ctrl+S", category: "geral" },
  { action: "Publicar", keys: "Ctrl+Shift+P", category: "geral" },
  { action: "Desfazer", keys: "Ctrl+Z", category: "geral" },
  { action: "Refazer", keys: "Ctrl+Shift+Z", category: "geral" },
  { action: "Command Palette", keys: "Ctrl+K", category: "geral" },
  { action: "Fechar painel", keys: "Esc", category: "navegação" },
  { action: "Testar (toggle)", keys: "1", category: "painéis" },
  { action: "Deploy (toggle)", keys: "2", category: "painéis" },
  { action: "Debug (toggle)", keys: "3", category: "painéis" },
  { action: "Ajustar zoom", keys: "Ctrl+Shift+F", category: "canvas" },
  { action: "Chat vibe (toggle)", keys: "Ctrl+Shift+L", category: "canvas" },
  { action: "Selecionar todos", keys: "Ctrl+A", category: "canvas" },
] as const;
