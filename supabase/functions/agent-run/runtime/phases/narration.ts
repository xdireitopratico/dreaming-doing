// runtime/phases/narration.ts — Abertura, narração e inspector notes (Fase 2.2)
import { sanitizeUserFacingProse } from "../../sanitize-prose.ts";
import {
  collapseNarrationBuffer,
  filterLoopAgentProseForChat,
  isDuplicateNarrationChunk,
} from "../../narration-dedupe.ts";

export type NarrationEmit = (type: string, data: unknown) => void;

export type NarrationPhaseConfig = {
  approvedPlanBuild: boolean;
  buildFixResume: boolean;
};

export type StreamNarrationOpts = {
  append?: boolean;
  chatVisible?: boolean;
};

export class NarrationPhase {
  buffer = "";
  openingEmitted = false;
  narrationStarted = false;

  constructor(
    private readonly config: NarrationPhaseConfig,
    private readonly emit: NarrationEmit,
    private readonly onActivity?: () => void,
  ) {}

  trim(): string {
    return this.buffer.trim();
  }

  append(text: string): void {
    const chunk = text.trim();
    if (!chunk) return;
    const merged = this.buffer ? `${this.buffer}\n\n${chunk}` : chunk;
    this.buffer = collapseNarrationBuffer(merged);
    this.onActivity?.();
  }

  emitInspectorNote(message: string): void {
    const chunk = message.trim();
    if (!chunk) return;
    this.emit("phase", {
      phase: "checkpoint",
      message: chunk,
      task_title: chunk.slice(0, 120),
    });
  }

  emitOpening(text: string): void {
    if (this.openingEmitted) return;
    const chunk = text.trim();
    if (!chunk) return;
    if (isDuplicateNarrationChunk(this.buffer, chunk)) return;
    this.append(chunk);
    this.emit("assistant_text", {
      text: chunk,
      append: false,
      final: false,
      opening: true,
    });
    this.openingEmitted = true;
    this.narrationStarted = true;
  }

  stream(text: string, opts?: StreamNarrationOpts): void {
    const chunk = text.trim();
    if (!chunk) return;
    if (isDuplicateNarrationChunk(this.buffer, chunk)) return;

    const chatVisible = this.config.approvedPlanBuild
      ? opts?.chatVisible === true
      : opts?.chatVisible !== false;
    if (!chatVisible) {
      this.emitInspectorNote(chunk);
      return;
    }

    this.append(chunk);
    const shouldAppend = opts?.append ?? this.narrationStarted;
    this.emit("assistant_text", {
      text: shouldAppend ? `\n\n${chunk}` : chunk,
      append: shouldAppend,
      final: false,
      narration: true,
    });
    this.narrationStarted = true;
  }

  emitAgentProse(raw: string, loopStep: number): void {
    const clean = sanitizeUserFacingProse(raw);
    if (!clean) return;
    const filtered = filterLoopAgentProseForChat(clean, {
      loopStep,
      skipAck: this.config.buildFixResume,
    });
    if (!filtered) return;
    if (!this.openingEmitted && !this.config.buildFixResume) {
      this.emitOpening(filtered);
      return;
    }
    this.stream(filtered, {
      append: true,
      chatVisible: !this.config.approvedPlanBuild && !this.config.buildFixResume,
    });
  }
}