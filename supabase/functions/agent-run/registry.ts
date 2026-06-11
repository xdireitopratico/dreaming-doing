// registry.ts — ToolRegistry model-agnostic
// Centraliza definição e execução de tools
import type { ToolDefinition, ToolHandler, ToolCall, ToolResult } from "./types.ts";

export class ToolRegistry {
  private tools = new Map<string, { def: ToolDefinition; handler: ToolHandler }>();

  register(def: ToolDefinition, handler: ToolHandler): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" já registrada`);
    }
    this.tools.set(def.name, { def, handler });
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.def);
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const entry = this.tools.get(call.name);
    if (!entry) {
      return {
        toolCallId: call.id,
        ok: false,
        error: `Tool "${call.name}" não encontrada no registry`,
        output: null,
      };
    }
    try {
      const result = await entry.handler(call.arguments);
      return { ...result, toolCallId: call.id };
    } catch (err: any) {
      return {
        toolCallId: call.id,
        ok: false,
        error: err?.message ?? "Erro desconhecido na tool",
        output: null,
      };
    }
  }
}
