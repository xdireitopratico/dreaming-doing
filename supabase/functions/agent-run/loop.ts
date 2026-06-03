// loop.ts — AgentLoop DEFINITIVO
// Integra: Model Router, Compression, Parallel Exec, Runtime Observer, Skills
// O coração do FORGE — o maior custo-benefício agent builder do mundo
import type {
  AgentState, LLMProvider, ChatMessage, ToolCall, ToolResult,
  IntentAnalysis, ActionPlan, CheckResult, AgentContext, FileEntry, ChatResponse,
} from "./types.ts";
import { LoopPhase } from "./types.ts";
import { ToolRegistry } from "./registry.ts";
import { ModelRouter, type ClassificationResult } from "./router.ts";
import { CompressionManager, parallelExecute, buildCachedMessages } from "./compression.ts";
import { RuntimeObserver } from "./observer.ts";
import { SkillRegistry } from "./skills.ts";
import { SYSTEM_PROMPT, ANALYZE_PROMPT, EXECUTE_PROMPT } from "./prompts.ts";

type StreamCallback = (event: { type: string; data: unknown }) => void;

export class AgentLoop {
  private reg: ToolRegistry;
  private state: AgentState;
  private llm: LLMProvider;
  private sb: any;
  private maxSteps = 20;
  private onStream: StreamCallback;
  private router: ModelRouter;
  private compression: CompressionManager;
  private observer: RuntimeObserver;
  private skills: SkillRegistry;

  constructor(
    reg: ToolRegistry,
    llm: LLMProvider,
    supabase: any,
    state: AgentState,
    onStream: StreamCallback = () => {},
  ) {
    this.reg = reg;
    this.llm = llm;
    this.sb = supabase;
    this.state = state;
    this.onStream = onStream;
    this.router = new ModelRouter();
    this.observer = new RuntimeObserver(reg);
    this.skills = new SkillRegistry();
    this.compression = new CompressionManager(this.router.getCheapProvider());
  }

  async run(): Promise<{ ok: boolean; summary?: string; error?: string; steps: number }> {
    this.state.executionLog = [];
    this.compression.reset();
    let step = 0;

    // ─── FASE 0: GATHER CONTEXT (0 tokens LLM) ───
    this.emit("phase", { phase: "gather", message: "Analisando projeto..." });
    await this.gatherContext();

    // ─── FASE 0.5: CLASSIFY (modelo barato, $0.15/1M) ───
    this.emit("phase", { phase: "classify", message: "Classificando complexidade..." });
    const userPrompt = this.state.messages.filter(m => m.role === "user").pop()?.content ?? "";
    const classification = await this.router.classify(
      userPrompt,
      this.state.context?.projectConfig ?? "(vazio)",
    );
    this.state.intent = {
      type: classification.type as IntentAnalysis["type"],
      summary: classification.summary,
      scope: [],
      complexity: classification.complexity <= 2 ? "simple" : classification.complexity <= 4 ? "medium" : "complex",
    };

    // Seleciona modelo por complexidade
    const executionModel = this.router.selectModel(classification.complexity);
    this.emit("classify", {
      complexity: classification.complexity,
      model: classification.complexity <= 2 ? "cheap" : "main",
      summary: classification.summary,
    });

    this.emit("phase", { phase: "plan", message: `Plano: ${classification.summary}`, intent: this.state.intent });

    // ─── FASE 1: EXECUTE LOOP (com auto-correção) ───
    let buildAttempts = 0;
    const maxRetries = 3;

    while (step < this.maxSteps) {
      step++;
      this.state.totalSteps = step;

      // Comprimir histórico se necessário
      const compressed = await this.compression.compress(this.state.messages);

      const response = await this.llmChat(executionModel, EXECUTE_PROMPT, compressed);
      if (!response) break;

      // Sem tool calls = resposta final
      if (!response.tool_calls || response.tool_calls.length === 0) {
        this.state.messages.push({ role: "assistant", content: response.content ?? "Concluído." });
        break;
      }

      // ─── PARALLEL EXECUTION ───
      this.emit("phase", { phase: "execute", toolCount: response.tool_calls.length });

      const execResults = await parallelExecute(response.tool_calls, async (call) => {
        this.emit("tool_start", { name: call.name, args: call.arguments });
        const result = await this.reg.execute(call);
        this.emit("tool_done", { name: call.name, ok: result.ok, error: result.error });

        // Commit atômico após fs_write
        if (call.name === "fs_write" && result.ok) {
          const commit = await this.reg.execute({
            id: crypto.randomUUID(),
            name: "shell_exec",
            arguments: { command: `git add -A && git commit -m "${(call.arguments.path as string)}: update" 2>&1 || echo 'ok'` },
          });
          if (commit.ok) this.emit("tool_done", { name: "git_commit", ok: true });
        }
        return result;
      });

      // Adiciona ao histórico
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.content ?? "",
        tool_calls: response.tool_calls.map(tc => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
      this.state.messages.push(assistantMsg);
      for (const { call, result } of execResults) {
        this.state.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }

      // ─── RUNTIME OBSERVATION ───
      const modifiedFiles = response.tool_calls.some(t => t.name === "fs_write" || t.name === "fs_edit");
      if (modifiedFiles && buildAttempts < maxRetries) {
        this.emit("phase", { phase: "observe", message: "Observando runtime..." });

        const observation = await this.observer.observe();

        if (!observation.passed) {
          buildAttempts++;
          this.emit("validate_fail", {
            attempt: buildAttempts,
            checks: observation.checks.filter(c => !c.ok).map(c => c.name),
            feedback: observation.feedback?.slice(0, 500),
          });
          this.state.messages.push({
            role: "user",
            content: `VERIFICAÇÃO DE RUNTIME FALHOU (${buildAttempts}/${maxRetries}). Analise e corrija:\n\n\`\`\`\n${observation.feedback?.slice(0, 3000)}\n\`\`\`\n\nCorrija os erros e NÃO peça ajuda. Use fs_search para encontrar o erro e fs_edit para corrigir.`,
          });
          continue;
        } else {
          buildAttempts = 0;
          this.emit("validate_ok", { message: "Runtime OK" });
        }
      }

      // Stuck detection
      if (this.isStuck(step)) {
        this.state.messages.push({
          role: "user",
          content: "Você parece estar preso repetindo as mesmas ações. Tente uma abordagem diferente.",
        });
      }
    }

    if (step >= this.maxSteps) {
      await this.persist("Loop atingiu limite de passos.");
      return { ok: false, error: "Limite de passos", steps: step };
    }

    // ─── FASE 2: SUMMARIZE (modelo barato) ───
    this.emit("phase", { phase: "summarize", message: "Finalizando..." });
    const finalMsg = this.state.messages[this.state.messages.length - 1];
    const summary = finalMsg?.content ?? "Tarefa concluída.";

    await this.persist(summary);
    this.emit("done", { summary });
    return { ok: true, summary, steps: step };
  }

  private async gatherContext(): Promise<void> {
    const { data: files } = await this.sb
      .from("project_files")
      .select("path, content, updated_at")
      .eq("project_id", this.state.projectId);

    const fileList: FileEntry[] = files ?? [];
    const manifest = fileList.map(f => `  ${f.path}`).join("\n");

    // Lê arquivos-chave
    let projectConfig = "";
    const keyFiles = fileList.filter(f =>
      ["package.json", "tsconfig.json", "vite.config.ts", "next.config.js", "next.config.ts",
       "tailwind.config.ts", "index.html", "src/App.tsx", "src/main.tsx"].includes(f.path),
    );
    for (const f of keyFiles) {
      projectConfig += `\n### ${f.path}\n\`\`\`\n${(f.content ?? "").slice(0, 2000)}\n\`\`\`\n`;
    }

    // Detecta skills ativas
    const skillPrompt = this.skills.buildSkillPrompt(fileList);
    if (skillPrompt) {
      this.emit("skills", { active: this.skills.detectActive(fileList).map(s => s.name) });
    }

    this.state.context = {
      files: fileList,
      manifest: manifest || "(projeto vazio)",
      projectConfig: projectConfig || "(projeto vazio — sem arquivos de configuração)",
      gitLog: "(não disponível ainda)",
      dbSchema: "(não disponível)",
      lastPlan: "nenhum",
    };
  }

  private async llmChat(
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
  ): Promise<ChatResponse | null> {
    const contextBlock = this.state.context
      ? `## Contexto do Projeto\n${this.state.context.projectConfig}\n\n## Arquivos\n${this.state.context.manifest}`
      : "(projeto novo)";

    const skillPrompt = this.state.context
      ? this.skills.buildSkillPrompt(this.state.context.files)
      : "";

    const fullSystemPrompt = skillPrompt ? `${SYSTEM_PROMPT}\n\n${skillPrompt}` : SYSTEM_PROMPT;

    const messages: ChatMessage[] = [
      { role: "system", content: fullSystemPrompt },
      { role: "system", content: contextBlock },
      ...history,
      { role: "user", content: instruction },
    ];

    try {
      return await model.chat({
        messages,
        tools: this.reg.getDefinitions(),
        tool_choice: "auto",
        max_tokens: 4096,
      });
    } catch (err: any) {
      this.emit("error", { message: err.message });
      return null;
    }
  }

  private isStuck(step: number): boolean {
    if (step < 3) return false;
    const last3 = this.state.executionLog.slice(-3);
    const allSame = last3.length >= 3 && last3.every(l => l === last3[0]);
    return allSame;
  }

  private async persist(summary: string): Promise<void> {
    await this.sb.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text: summary }],
      tool_calls: [],
    });
    await this.sb.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", this.state.projectId);
  }

  private emit(type: string, data: unknown): void {
    this.onStream({ type, data });
  }
}
