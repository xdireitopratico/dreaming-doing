/**
 * useWhisperSTT — Hook de Speech-to-Text.
 * Estratégia:
 *   - Mobile: Whisper (VPS) direto
 *   - Desktop: Web Speech API → fallback Whisper (VPS)
 * Ambos gratuitos, zero custo.
 */
import { useState, useRef, useCallback, useMemo } from "react";

// ─── Whisper hallucination filter (only obvious non-speech artifacts) ───
const HALLUCINATION_PATTERNS = [
  "adriana zanotto",
  "legendado por",
  "legendas por",
  "legenda por",
  "subtítulos por",
  "transcrição por",
  "inscreva-se",
  "se inscreva",
  "curta o vídeo",
  "continua...",
  "aplausos",
];

// Exact-match hallucinations (lone words that Whisper hallucinates on silence)
const EXACT_HALLUCINATIONS = [
  "tchau", "tchau.", "tchau!", "bye", "bye bye", "bye-bye",
  "até logo", "até mais", "até breve", "até a próxima",
  "obrigado", "obrigado.", "obrigada", "obrigada.",
  "fui", "fui.", "música", "musica",
];

const MIN_AUDIO_BLOB_SIZE = 3200; // ~2s at low bitrate — raised to reduce hallucinations

function isWhisperHallucination(text: string | null, blobSize: number): boolean {
  if (!text) return true;
  const lower = text.toLowerCase().trim();
  if (!lower) return true;

  // Substring match for known subtitle/credit hallucinations
  if (HALLUCINATION_PATTERNS.some(p => lower.includes(p))) {
    console.warn("[useWhisperSTT] Hallucination filtered (substring):", text);
    return true;
  }

  // Exact match for lone-word hallucinations
  const cleaned = lower.replace(/[.\s!?]+$/g, "").trim();
  if (EXACT_HALLUCINATIONS.some(p => cleaned === p.toLowerCase())) {
    console.warn("[useWhisperSTT] Hallucination filtered (exact):", text);
    return true;
  }

  return false;
}
import { supabase } from "@/integrations/supabase/client";

interface UseWhisperSTTOptions {
  language?: string;
  whisperModel?: string;
  onTranscript: (text: string) => void;
  onPartial?: (text: string) => void;
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function useWhisperSTT({ language = "pt", whisperModel = "large-v3", onTranscript, onPartial }: UseWhisperSTTOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const webSpeechRef = useRef<any>(null);
  const usingWebSpeechRef = useRef(false);

  const isMobile = useMemo(() => isMobileDevice(), []);

  const isSupported = typeof navigator !== "undefined" && (
    !!navigator.mediaDevices?.getUserMedia ||
    !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition
  );

  // ─── Whisper VPS via edge function (with retry) ───
  const transcribeWithWhisper = useCallback(async (blob: Blob): Promise<string | null> => {
    const attempt = async (retryCount: number): Promise<string | null> => {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("language", language);
      formData.append("model", whisperModel);

      const { data, error: fnError } = await supabase.functions.invoke("vps-whisper-transcribe", {
        body: formData,
      });

      if (fnError || !data?.success) {
        if (retryCount < 1) {
          console.warn("[useWhisperSTT] Retry after", (retryCount + 1) * 2000, "ms");
          await new Promise(r => setTimeout(r, (retryCount + 1) * 2000));
          return attempt(retryCount + 1);
        }
        throw new Error(fnError?.message || data?.error || "Whisper falhou");
      }

      return data.text?.trim() || null;
    };
    return attempt(0);
  }, [language, whisperModel]);

  // ─── Web Speech API (desktop primary) ───
  const startWebSpeech = useCallback((whisperFallback: boolean) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (whisperFallback) return false; // signal to use whisper instead
      setError("Navegador não suporta reconhecimento de voz");
      setIsRecording(false);
      return false;
    }

    usingWebSpeechRef.current = true;
    const recognition = new SpeechRecognition();
    recognition.lang = language === "pt" ? "pt-BR" : language;
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript + " ";
        } else {
          interim = transcript;
        }
      }
      if (interim) onPartial?.(finalText + interim);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      if (finalText.trim()) {
        onTranscript(finalText.trim());
      }
      setIsRecording(false);
      webSpeechRef.current = null;
      usingWebSpeechRef.current = false;
    };

    recognition.start();
    webSpeechRef.current = recognition;
    setIsRecording(true);
    return true;
  }, [language, onTranscript, onPartial]);

  // ─── Record + send to Whisper VPS ───
  const startWhisperRecording = useCallback(async () => {
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());

      if (chunksRef.current.length === 0) {
        setIsProcessing(false);
        return;
      }

      const blob = new Blob(chunksRef.current, { type: mimeType });
      console.log("[useWhisperSTT] recorder.onstop — blob size:", blob.size, "bytes, chunks:", chunksRef.current.length, "model:", whisperModel);

      // Filter 1: Discard tiny blobs (silence)
      if (blob.size < MIN_AUDIO_BLOB_SIZE) {
        console.warn("[useWhisperSTT] DISCARDED — blob too small:", blob.size, "bytes (min:", MIN_AUDIO_BLOB_SIZE, ")");
        setIsProcessing(false);
        return;
      }

      setIsProcessing(true);

      try {
        const text = await transcribeWithWhisper(blob);

        // Filter 2: Discard hallucinations
        if (isWhisperHallucination(text, blob.size)) {
          setIsProcessing(false);
          return;
        }

        if (text) onTranscript(text);
      } catch (err: any) {
        console.error("[useWhisperSTT] Whisper error:", err.message);
        setError("Transcrição indisponível no momento");
      } finally {
        setIsProcessing(false);
      }
    };

    recorder.start(250); // Smaller chunks for mobile resilience
    setIsRecording(true);
  }, [transcribeWithWhisper, onTranscript]);

  // ─── Start — Always Whisper VPS (no Web Speech) ───
  const start = useCallback(async () => {
    setError(null);
    usingWebSpeechRef.current = false;

    try {
      await startWhisperRecording();
    } catch {
      setError("Não foi possível acessar o microfone");
    }
  }, [startWhisperRecording]);

  const stop = useCallback(() => {
    if (usingWebSpeechRef.current && webSpeechRef.current) {
      webSpeechRef.current.stop();
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return { isRecording, isProcessing, isSupported, error, start, stop };
}
