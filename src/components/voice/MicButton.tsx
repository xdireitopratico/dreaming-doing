import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadAgentPreferences } from "@/lib/agent-preferences";

type Props = {
  onTranscript: (text: string) => void;
  className?: string;
  size?: "sm" | "md";
};

const STT_LABELS = {
  grok: "Grok STT (xAI)",
  groq: "Groq Whisper",
  openrouter: "OpenRouter STT",
} as const;

export function MicButton({ onTranscript, className, size = "md" }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const start = useCallback(async () => {
    const requested = loadAgentPreferences().sttProvider ?? "grok";

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

          const body = data as {
            text?: string;
            provider?: string;
            requested?: string;
          };
          const text = body?.text?.trim();
          const used = body?.provider ?? requested;

          if (text) {
            onTranscript(text);
            toast.success(`Voz · ${STT_LABELS[used as keyof typeof STT_LABELS] ?? used}`, {
              duration: 2500,
            });
            if (body?.requested && used !== body.requested) {
              toast.warning(
                `Pedido ${STT_LABELS[body.requested as keyof typeof STT_LABELS]} mas usou ${used}. Verifique API.`,
              );
            }
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
  const stt = loadAgentPreferences().sttProvider ?? "grok";

  if (state === "uploading") {
    return (
      <button
        type="button"
        disabled
        aria-label="Transcrevendo"
        title={`Transcrevendo com ${STT_LABELS[stt]}`}
        className={`${sizeCls} grid place-items-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-dim)] ${className ?? ""}`}
      >
        <Loader2 className={`${iconCls} animate-spin`} />
      </button>
    );
  }

  if (state === "recording") {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Parar gravação"
        className={`${sizeCls} grid place-items-center rounded-full bg-red-500/90 hover:bg-red-500 text-white animate-pulse ${className ?? ""}`}
      >
        <Square className={`${iconCls} fill-current`} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-label={`Gravar áudio (${STT_LABELS[stt]})`}
      title={`Microfone · ${STT_LABELS[stt]} — configurar em API`}
      className={`${sizeCls} grid place-items-center rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-dim)] hover:text-foreground transition-colors ${className ?? ""}`}
    >
      <Mic className={iconCls} />
    </button>
  );
}