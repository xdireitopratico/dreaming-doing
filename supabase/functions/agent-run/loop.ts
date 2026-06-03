// loop.ts — AgentLoop com inteligência operacional real
// Contexto inteligente, auto-correção, streaming SSE, criação de projetos
import type {
  AgentState, LLMProvider, ChatMessage, ToolCall, ToolResult,
  IntentAnalysis, ActionPlan, CheckResult, AgentContext, FileEntry, ChatResponse,
} from "./types.ts";
import { LoopPhase } from "./types.ts";
import { ToolRegistry } from "./registry.ts";
import { SYSTEM_PROMPT, ANALYZE_PROMPT, EXECUTE_PROMPT } from "./prompts.ts";

type StreamCallback = (event: { type: string; data: unknown }) => void;

export class AgentLoop {
  private reg: ToolRegistry;
  private state: AgentState;
  private llm: LLMProvider;
  private sb: any;
  private maxSteps = 20;
  private onStream: StreamCallback;

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
  }

  async run(): Promise<{ ok: boolean; summary?: string; error?: string; steps: number }> {
    this.state.executionLog = [];
    let step = 0;

    this.emit("phase", { phase: "gather", message: "Analisando projeto..." });

    // ─── FASE 1: Gather context (inteligente) ───
    await this.gatherContext();

    this.emit("phase", { phase: "analyze", message: "Entendendo o pedido..." });

    // ─── FASE 2: Analyze intent ───
    const intent = await this.analyzeIntent();
    this.state.intent = intent;
    this.emit("phase", { phase: "plan", message: `Plano: ${intent.summary}`, intent });

    // ─── FASE 3: Execute loop com auto-correção ───
    let buildAttempts = 0;

    while (step < this.maxSteps) {
      step++;
      this.state.totalSteps = step;

      const response = await this.llmChat(EXECUTE_PROMPT);
      if (!response) break;

      // Sem tool calls = resposta final
      if (!response.tool_calls || response.tool_calls.length === 0) {
        this.state.messages.push({ role: "assistant", content: response.content ?? "Concluído." });
        break;
      }

      // Executa cada tool call
      const results: ToolResult[] = [];
      for (const call of response.tool_calls) {
        this.emit("tool_start", { name: call.name, args: call.arguments });
        const result = await this.reg.execute(call);
        results.push(result);
        this.emit("tool_done", { name: call.name, ok: result.ok, error: result.error });

        // Se escreveu arquivo, tenta commit atômico
        if (call.name === "fs_write" && result.ok) {
          const commit = await this.reg.execute({
            id: crypto.randomUUID(),
            name: "shell_exec",
            arguments: { command: `git add -A && git commit -m "${call.arguments.path}: update" 2>&1 || echo 'git not available'` },
          });
          if (commit.ok) this.emit("tool_done", { name: "git_commit", ok: true });
        }
      }

      // Adiciona ao histórico: assistant msg + tool results
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
      for (let i = 0; i < response.tool_calls.length; i++) {
        this.state.messages.push({
          role: "tool",
          tool_call_id: response.tool_calls[i].id,
          content: JSON.stringify(results[i]).slice(0, 4000),
        });
      }

      // ─── Auto-correção: tenta build ───
      const needsBuild = response.tool_calls.some(t => t.name === "fs_write" || t.name === "shell_exec");
      if (needsBuild && buildAttempts < 3) {
        this.emit("phase", { phase: "validate", message: "Validando build..." });
        const build = await this.reg.execute({
          id: crypto.randomUUID(),
          name: "shell_exec",
          arguments: { command: "npm run build 2>&1" },
        });

        if (!build.ok) {
          buildAttempts++;
          const errOutput = typeof build.output === "object" ? (build.output as any).stderr ?? (build.output as any).stdout : build.output;
          const errMsg = typeof errOutput === "string" ? errOutput : JSON.stringify(errOutput ?? "");

          this.emit("validate_fail", { attempt: buildAttempts, error: errMsg.slice(0, 500) });
          this.state.messages.push({
            role: "user",
            content: `BUILD FALHOU (tentativa ${buildAttempts}/3). Analise o erro abaixo, corrija o código e NÃO peça ajuda:\n\n\`\`\`\n${errMsg.slice(0, 3000)}\n\`\`\``,
          });
          continue; // Re-executa com o erro como feedback
        } else {
          buildAttempts = 0;
          this.emit("validate_ok", { message: "Build passou" });
        }
      }
    }

    if (step >= this.maxSteps) {
      await this.persist("Loop atingiu limite de passos.");
      return { ok: false, error: "Limite de passos", steps: step };
    }

    // ─── FASE 4: Summarize ───
    this.emit("phase", { phase: "summarize", message: "Finalizando..." });
    const finalMsg = this.state.messages[this.state.messages.length - 1];
    const summary = finalMsg?.content ?? "Tarefa concluída.";

    await this.persist(summary);
    this.emit("done", { summary });
    return { ok: true, summary, steps: step };
  }

  // ─── Contexto inteligente: lê a alma do projeto ───
  private async gatherContext(): Promise<void> {
    const { data: files } = await this.sb
      .from("project_files")
      .select("path, content, updated_at")
      .eq("project_id", this.state.projectId);

    const fileList: FileEntry[] = files ?? [];
    const manifest = fileList.map(f => `  ${f.path}`).join("\n");

    // Lê arquivos-chave para dar contexto ao LLM
    let projectContext = "";
    const keyFiles = fileList.filter(f =>
      ["package.json", "tsconfig.json", "vite.config.ts", "next.config.js", "tailwind.config.ts",
       "README.md", "index.html", "src/App.tsx", "src/main.tsx", "src/index.tsx"].includes(f.path),
    );

    for (const f of keyFiles) {
      const content = f.content ?? "";
      projectContext += `\n### ${f.path}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\`\n`;
    }

    this.emit("context", { fileCount: fileList.length, keyFiles: keyFiles.map(f => f.path) });

    this.state.context = {
      files: fileList,
      manifest: manifest || "(projeto vazio)",
      projectConfig: projectContext || "(projeto vazio — sem arquivos de configuração)",
      gitLog: "(não disponível ainda)",
      dbSchema: "(não disponível)",
      lastPlan: "nenhum",
    };
  }

  // ─── Análise de intenção ───
  private async analyzeIntent(): Promise<IntentAnalysis> {
    const userMsg = this.state.messages.filter(m => m.role === "user").pop()?.content ?? "";

    const resp = await this.llm.chat({
      messages: [
        { role: "system", content: ANALYZE_PROMPT },
        { role: "user", content: `## Projeto\n${this.state.context?.projectConfig ?? "(vazio)"}\n\n## Pedido\n${userMsg}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
      temperature: 0.1,
    });

    try {
      const j = JSON.parse(resp.content ?? "{}");
      return {
        type: j.type ?? "modify",
        summary: j.summary ?? userMsg.slice(0, 100),
        scope: j.files_involved ?? [],
        complexity: "simple",
      };
    } catch {
      return { type: "modify", summary: userMsg.slice(0, 100), scope: [], complexity: "simple" };
    }
  }

  // ─── LLM chat com sistema + contexto + histórico ───
  private async llmChat(instruction: string): Promise<ChatResponse | null> {
    const contextBlock = this.state.context
      ? `## Contexto do Projeto\n${this.state.context.projectConfig}\n\n## Arquivos\n${this.state.context.manifest}`
      : "(projeto novo — nenhum arquivo existe ainda)";

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: contextBlock },
      { role: "user", content: instruction },
      ...this.state.messages.slice(-24), // últimas 24 mensagens
    ];

    try {
      return await this.llm.chat({
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

  // ─── Persiste resultado final ───
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
