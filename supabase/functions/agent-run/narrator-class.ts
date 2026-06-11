// narrator.ts — Classe standalone para gerenciar narração do agente.
// Extraída do loop.ts para ser reutilizável entre workers.
export type StreamFn = (type: string, data: unknown) => void;

export class AgentNarrator {
  private buffer: string;
  private started: boolean;
  private stream: StreamFn;
  private touchedPaths: Set<string>;

  constructor(stream: StreamFn) {
    this.buffer = "";
    this.started = false;
    this.stream = stream;
    this.touchedPaths = new Set();
  }

  get narrationBuffer(): string {
    return this.buffer;
  }

  recordTouchedPath(path: string): void {
    if (path) this.touchedPaths.add(path);
  }

  get touchedFiles(): string[] {
    return [...this.touchedPaths];
  }

  reset(): void {
    this.buffer = "";
    this.started = false;
    this.touchedPaths = new Set();
  }

  /** Adiciona texto ao buffer interno (sem emitir). */
  append(text: string): void {
    const chunk = text.trim();
    if (!chunk) return;
    this.buffer = this.buffer ? `${this.buffer}\n\n${chunk}` : chunk;
  }

  /** Emite texto de narração para o stream (markdown no chat). */
  streamNarration(text: string): void {
    const chunk = text.trim();
    if (!chunk) return;
    this.append(chunk);

    const shouldAppend = this.started;
    this.stream("assistant_text", {
      text: shouldAppend ? `\n\n${chunk}` : chunk,
      append: shouldAppend,
      final: false,
      narration: true,
    });
    this.started = true;
  }

  /** Emite texto final do assistente no chat. */
  streamFinal(text: string): void {
    const chunk = text.trim();
    if (!chunk) return;
    this.append(chunk);
    this.stream("assistant_text", {
      text: chunk,
      append: this.started,
      final: true,
    });
    this.started = true;
  }
}
