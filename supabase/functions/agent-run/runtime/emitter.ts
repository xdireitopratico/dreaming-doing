// runtime/emitter.ts — Stream events + enrichment + tail buffer (Fase 2.1)
import {
  buildPhaseTaskTitle,
  describeStepExpectation,
  extractStepFilePaths,
} from "../../_shared/step-intent.ts";
import { AGENT_STREAM_EVENT_TYPES, type AgentStreamEventType } from "../_events.ts";

export type StreamCallback = (event: { type: string; data: unknown }) => void;

export interface StreamTailEntry {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

/** Eventos que alimentam timeline / streamTail no checkpoint.
 *
 * Regra: só entra na timeline o que é factual/intencional para o usuário.
 * Ruído interno (phase, explore, classify, heartbeat, build_log bruto, etc.)
 * fica fora — pode atualizar statusHint/telemetry, mas não a história canônica.
 */
export const TIMELINE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "agent_note",
  "alert",
  "design",
  "thinking_text",
  "tool_start",
  "tool_done",
  "step_result",
  "step",
  "task",
  "delivery_checkpoint",
  "file_diff",
  "plan_proposed",
  "gate_decision",
  "skills",
  "done",
  "finish",
  "canceled",
  "error",
]);

const CONTRACT_EVENT_TYPES = new Set<string>(AGENT_STREAM_EVENT_TYPES);

export interface RuntimeEmitterOptions {
  getTaskPhase?: () => string;
  /** Cap do ring buffer de timeline (default 200). */
  tailCap?: number;
  /** Emite aviso quando tipo não está no contrato canônico. */
  warnOnUnknownType?: boolean;
}

function isContractEventType(type: string): type is AgentStreamEventType {
  return CONTRACT_EVENT_TYPES.has(type);
}

export class RuntimeEmitter {
  private onStream: StreamCallback;
  private getTaskPhase: () => string;
  private tailCap: number;
  private warnOnUnknownType: boolean;
  private streamTailBuffer: StreamTailEntry[] = [];

  constructor(onStream: StreamCallback = () => {}, options: RuntimeEmitterOptions = {}) {
    this.onStream = onStream;
    this.getTaskPhase = options.getTaskPhase ?? (() => "running");
    this.tailCap = options.tailCap ?? 200;
    this.warnOnUnknownType = options.warnOnUnknownType ?? false;
  }

  /** Ring buffer completo — usado em cardSnapshot.timeline. */
  getTailBuffer(): readonly StreamTailEntry[] {
    return this.streamTailBuffer;
  }

  /** Últimos N eventos — persistidos em meta.streamTail. */
  tailSlice(count: number): StreamTailEntry[] {
    return this.streamTailBuffer.slice(-count);
  }

  emit(type: string, data: unknown): void {
    if (this.warnOnUnknownType && !isContractEventType(type)) {
      console.warn(`[RuntimeEmitter] unknown stream event type: ${type}`);
    }

    let payload = data;
    if (payload && typeof payload === "object") {
      const d = { ...(payload as Record<string, unknown>) };
      if (type === "phase" && typeof d.phase === "string") {
        d.task_title =
          d.task_title ??
          buildPhaseTaskTitle(
            String(d.phase),
            typeof d.message === "string" ? d.message : undefined,
          );
        payload = d;
      }
      if (type === "tool_start" && typeof d.name === "string") {
        const args = (d.args as Record<string, unknown> | undefined) ?? {};
        d.step_intent = d.step_intent ?? describeStepExpectation(String(d.name), args);
        d.task_phase = d.task_phase ?? this.getTaskPhase();
        d.file_paths = d.file_paths ?? extractStepFilePaths(String(d.name), args);
        payload = d;
      }
      if (type === "validate_ok") {
        this.onStream({
          type: "step_result",
          data: {
            summary: typeof d.message === "string" ? d.message : "Build passou",
            evidence: ["Compilação OK", "Preview pronto para abrir"],
            ok: true,
          },
        });
      }
      if (type === "validate_fail") {
        this.onStream({
          type: "step_result",
          data: {
            summary: "Build falhou — corrigindo antes de entregar",
            evidence: [
              typeof d.feedback === "string"
                ? d.feedback.slice(0, 120)
                : typeof d.message === "string"
                  ? d.message.slice(0, 120)
                  : "Erro de compilação",
            ],
            ok: false,
          },
        });
      }
      if (type === "typecheck_fail") {
        const errors = Array.isArray(d.errors) ? d.errors : [];
        const files = Array.isArray(d.files) ? d.files : [];
        this.onStream({
          type: "step_result",
          data: {
            summary: `TypeScript: ${errors.length} erro(s) — corrigindo`,
            evidence: files.length ? files.slice(0, 5) : undefined,
            ok: false,
          },
        });
      }

      // ── Higienização de eventos internos → alert canônico na timeline ──
      if (type === "rate_limit") {
        this.onStream({
          type: "alert",
          data: {
            level: "warn",
            message: typeof d.message === "string" ? d.message : "Rate limit atingido — alternando chave…",
            alertId: "rate_limit",
          },
        });
      }
      if (type === "connection_retry") {
        this.onStream({
          type: "alert",
          data: {
            level: "warn",
            message: typeof d.message === "string" ? d.message : "Reconectando ao modelo…",
            alertId: "connection_retry",
          },
        });
      }
      if (type === "timeout_warning") {
        this.onStream({
          type: "alert",
          data: {
            level: "warn",
            message: typeof d.message === "string" ? d.message : "Budget de passos quase esgotado",
            alertId: "timeout_warning",
          },
        });
      }
      if (type === "stuck") {
        const reason = typeof d.reason === "string" ? d.reason : "";
        const message = typeof d.message === "string" && d.message.trim() ? d.message : "Modelo preso — tentando destravar";
        this.onStream({
          type: "alert",
          data: {
            level: "error",
            message: reason ? `${message} (${reason})` : message,
            alertId: `stuck-${reason || "generic"}`,
          },
        });
      }
      if (type === "context_compress") {
        this.onStream({
          type: "alert",
          data: {
            level: "info",
            message: typeof d.message === "string" ? d.message : "Compactando contexto — isso pode levar um minuto",
            alertId: "context_compress",
          },
        });
      }
      if (type === "context_pressure") {
        this.onStream({
          type: "alert",
          data: {
            level: "info",
            message: typeof d.message === "string" ? d.message : "Contexto grande — otimizando memória",
            alertId: "context_pressure",
          },
        });
      }
      if (type === "background_wait") {
        const eta = typeof d.etaSec === "number" ? d.etaSec : null;
        const url = typeof d.source_url === "string" ? d.source_url : "";
        const reason = typeof d.reason === "string" ? d.reason : "";
        const etaText = eta !== null ? ` · ~${eta}s` : "";
        this.onStream({
          type: "alert",
          data: {
            level: "info",
            message: `Extraindo conteúdo${url ? ` de ${url}` : ""}${etaText}${reason ? ` · ${reason}` : ""}`,
            alertId: `background_wait-${url || "generic"}`,
          },
        });
      }
      if (type === "background_resume") {
        const url = typeof d.source_url === "string" ? d.source_url : "";
        this.onStream({
          type: "alert",
          data: {
            level: "info",
            message: url ? `Extração concluída · ${url}` : "Extração concluída — retomando",
            alertId: `background_resume-${url || "generic"}`,
          },
        });
      }

      // ── Higienização de eventos de design → design canônico na timeline ──
      if (type === "design_resolve") {
        const voices = Array.isArray(d.voices) ? (d.voices as string[]) : [];
        const techniques = Array.isArray(d.techniques) ? (d.techniques as string[]) : [];
        const composite = typeof d.composite === "string" ? d.composite : "";
        this.onStream({
          type: "design",
          data: {
            kind: "resolve",
            title: voices.length ? `Design system · ${voices.slice(0, 2).join(", ")}` : "Design system resolvido",
            detail: composite ? composite.slice(0, 160) : techniques.slice(0, 3).join(", "),
          },
        });
      }
      if (type === "dna_ready") {
        const url = typeof d.source_url === "string" ? d.source_url : "";
        const sig = typeof d.signature === "string" ? d.signature : "";
        this.onStream({
          type: "design",
          data: {
            kind: "dna_ready",
            title: url ? `Design DNA extraído de ${url}` : "Design DNA extraído",
            detail: sig ? sig.slice(0, 160) : undefined,
          },
        });
      }
      if (type === "directive") {
        const brief = typeof d.brief === "string" ? d.brief : "";
        const gesture = typeof d.gesture === "string" ? d.gesture : "";
        const techniques = Array.isArray(d.techniques) ? (d.techniques as string[]) : [];
        this.onStream({
          type: "design",
          data: {
            kind: "directive",
            title: gesture ? `Diretriz de design · ${gesture}` : "Diretriz de design aplicada",
            detail: techniques.slice(0, 3).join(", ") || brief.slice(0, 160) || undefined,
          },
        });
      }
      if (type === "build_step") {
        const section = typeof d.section === "string" ? d.section : "";
        const technique = typeof d.technique === "string" ? d.technique : "";
        const layer = typeof d.layer === "string" ? d.layer : "";
        this.onStream({
          type: "design",
          data: {
            kind: "build_step",
            title: section ? `Construindo ${section}` : "Passo de construção",
            detail: [technique, layer].filter(Boolean).join(" · ") || undefined,
          },
        });
      }
    }

    if (TIMELINE_EVENT_TYPES.has(type) && payload && typeof payload === "object") {
      this.streamTailBuffer.push({
        type,
        data: { ...(payload as Record<string, unknown>) },
        timestamp: Date.now(),
      });
      if (this.streamTailBuffer.length > this.tailCap) {
        this.streamTailBuffer.shift();
      }
    }

    this.onStream({ type, data: payload });
  }
}