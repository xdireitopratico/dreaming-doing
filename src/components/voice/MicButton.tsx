import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  onTranscript: (text: string) => void;
  className?: string;
  size?: "sm" | "md";
};

/**
 * MicButton — grava áudio do mic (MediaRecorder) e envia para
 * a Edge Function voice-transcribe (Groq Whisper Large v3 turbo).
 */
export function MicButton({ onTranscript, className, size = "md" }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const start = useCallback(async () => {
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
          const { data, error } = await supabase.functions.invoke("voice-transcribe", { body: fd });
          if (error) throw new Error(error.message);
          const text = (data as any)?.text?.trim();
          if (text) onTranscript(text);
          else toast.error("Não captei nada. Tenta de novo.");
        } catch (err: any) {
          toast.error(err?.message ?? "Falha ao transcrever");
        } finally {
          setState("idle");
        }
      };
      rec.start();
      recRef.current = rec;
      setState("recording");
    } catch (err: any) {
      toast.error(err?.message ?? "Acesso ao microfone negado");
      setState("idle");
    }
  }, [onTranscript]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const sizeCls = size === "sm" ? "size-8" : "size-9";
  const iconCls = size === "sm" ? "size-3.5" : "size-4";

  if (state === "uploading") {
    return (
      <button
        type="button"
        disabled
        aria-label="Transcrevendo"
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
      aria-label="Gravar áudio"
      className={`${sizeCls} grid place-items-center rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-dim)] hover:text-foreground transition-colors ${className ?? ""}`}
    >
      <Mic className={iconCls} />
    </button>
  );
}
