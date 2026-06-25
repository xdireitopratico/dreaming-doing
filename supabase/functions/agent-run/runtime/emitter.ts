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

/** Eventos que alimentam timeline / streamTail no checkpoint. */
export const TIMELINE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "phase",
  "explore",
  "memory",
  "classify",
  "skills",
  "tool_start",
  "tool_done",
  "step_result",
  "assistant_text",
  "thinking_text",
  "validate_ok",
  "validate_fail",
  "gate",
  "background_wait",
  "background_resume",
  "design_resolve",
  "dna_ready",
  "directive",
  "build_step",
  "delivery_checkpoint",
  "file_diff",
  "done",
  "finish",
  "timeout_warning",
  "heartbeat",
  "error",
  "stuck",
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