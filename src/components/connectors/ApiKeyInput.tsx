// ApiKeyInput.tsx — Input seguro de chave API com toggle visibility
// Estilo 1Password: mascara por padrão, copia com 1 clique, valida formato
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Copy, Check, Trash2, Key, AlertCircle } from "lucide-react";

interface ApiKeyInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onDelete?: () => void;
  provider: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  saved?: boolean;
}

const spring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 34,
};

export function ApiKeyInput({
  label,
  value,
  onChange,
  onDelete,
  provider,
  placeholder = "sk-...",
  disabled = false,
  error,
  saved = false,
}: ApiKeyInputProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCopy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const maskValue = useCallback(
    (val: string) => {
      if (!val) return "";
      if (visible) return val;
      const prefix = val.slice(0, 3);
      const suffix = val.slice(-4);
      return `${prefix}${"•".repeat(Math.min(20, val.length - 7))}${suffix}`;
    },
    [visible],
  );

  const hasValue = value.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="space-y-1.5"
    >
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--text-dim)]">
          <Key className="size-3 text-[var(--text-ghost)]" />
          {label}
        </label>
        {saved && (
          <span className="flex items-center gap-1 font-mono text-[8px] text-emerald-400">
            <Check className="size-3" />
            SALVO
          </span>
        )}
      </div>

      {/* Input row */}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
          focused
            ? "border-[var(--primary)]/50 bg-[var(--surface-1)] shadow-[0_0_0_2px_var(--primary)_0.05]"
            : error
              ? "border-[var(--destructive)]/40 bg-[var(--destructive)]/5"
              : "border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[var(--border)]/80"
        }`}
      >
        <input
          ref={inputRef}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none font-mono tracking-[0.02em]"
        />

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Toggle visibility */}
          <button
            onClick={() => setVisible(!visible)}
            className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors"
            title={visible ? "Ocultar" : "Mostrar"}
          >
            {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>

          {/* Copy */}
          {hasValue && (
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors"
              title="Copiar"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          )}

          {/* Delete */}
          {hasValue && onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-[var(--destructive)]/10 text-[var(--text-ghost)] hover:text-[var(--destructive)] transition-colors"
              title="Remover"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-1.5"
          >
            <AlertCircle className="size-3 text-[var(--destructive)]" />
            <span className="font-mono text-[9px] text-[var(--destructive)]">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider info */}
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="font-mono text-[8px] text-[var(--text-ghost)]">{provider}</span>
        {hasValue && (
          <>
            <span className="text-[var(--border)]">·</span>
            <span className="font-mono text-[8px] text-[var(--text-ghost)]">
              {value.length} caracteres
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
}
