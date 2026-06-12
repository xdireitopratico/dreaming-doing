import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { STT_DEFAULT_PROVIDER, sttProviderName } from "@/lib/stt-config";

type Props = {
  onTranscript: (text: string) => void;
  className?: string;
  size?: "sm" | "md";
  /** Estilo plano do composer Lovable — sem rounded-full/border próprios. */
  variant?: "default" | "composer";
};

export function MicButton({
  onTranscript,
  className,
  size = "md",
  variant = "default",
}: Props) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const start = useCallback(async () => {
    const requested = loadAgentPreferences().sttProvider ?? STT_DEFAULT_PROVIDER;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1024) {
          setState("idle");
          return;
        }
        setState("uploading");
        try {
          const fd = new FormData();
          fd.append("file", blob, "audio.webm");
          fd.append("language", "pt");
          fd.append("provider", requested);
          const { data, error } = await supabase.functions.invoke("voice-transcribe", {
            body: fd,
          });
          const errMsg = (data as { error?: string })?.error;
          if (errMsg) throw new Error(errMsg);
          if (error) throw new Error(error.message);

          const body = data as { text?: string; provider?: string; requested?: string };
          const text = body?.text?.trim();

          if (text) {
            onTranscript(text);
          } else {
            toast.error("Não captei nada. Tenta de novo.");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Falha ao transcrever";
          toast.error(msg, { duration: 6000 });
        } finally {
          setState("idle");
        }
      };
      rec.start();
      recRef.current = rec;
      setState("recording");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Acesso ao microfone negado");
      setState("idle");
    }
  }, [onTranscript]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const sizeCls = size === "sm" ? "size-8" : "size-9";
  const iconCls = size === "sm" ? "size-3.5" : "size-4";
  const stt = loadAgentPreferences().sttProvider ?? STT_DEFAULT_PROVIDER;
  const isComposer = variant === "composer";

  const composerCls = cn("forge-composer-mic", className);
  const defaultIdleCls = cn(
    sizeCls,
    "grid place-items-center rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-dim)] hover:text-foreground transition-colors",
    className,
  );
  const defaultUploadCls = cn(
    sizeCls,
    "grid place-items-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-dim)]",
    className,
  );
  const defaultRecordCls = cn(
    sizeCls,
    "grid place-items-center rounded-full bg-red-500/90 hover:bg-red-500 text-white animate-pulse",
    className,
  );

  if (state === "uploading") {
    return (
      <button
        type="button"
        disabled
        aria-label="Transcrevendo"
        title={`Transcrevendo · ${sttProviderName(stt)}`}
        className={isComposer ? composerCls : defaultUploadCls}
      >
        <Loader2 className={cn(iconCls, "animate-spin")} />
      </button>
    );
  }

  if (state === "recording") {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Parar gravação"
        className={
          isComposer
            ? cn(composerCls, "forge-composer-mic--recording")
            : defaultRecordCls
        }
      >
        <Square className={cn(iconCls, "fill-current")} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-label={`Gravar áudio (${sttProviderName(stt)})`}
      title={`Microfone · ${sttProviderName(stt)}`}
      className={isComposer ? composerCls : defaultIdleCls}
    >
      <Mic className={iconCls} />
    </button>
  );
}