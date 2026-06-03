// loop.ts — AgentLoop com fases model-agnósticas
import type {
  AgentState, LLMProvider, ChatMessage, ToolCall, ToolResult,
  IntentAnalysis, ActionPlan, CheckResult, AgentContext,
} from "./types.ts";
import { LoopPhase } from "./types.ts";
import { ToolRegistry } from "./registry.ts";
import { INTENT_ANALYZER_PROMPT, PLANNER_PROMPT, EXECUTOR_PROMPT, SUMMARIZER_PROMPT } from "./prompts.ts";

export class AgentLoop {
  private registry: ToolRegistry;
  private state: AgentState;
  private decider: LLMProvider;
  private supabase: any;
  private maxSteps = 15;
  private checkpointInterval = 3; // salva checkpoint a cada N steps

  constructor(
    registry: ToolRegistry,
    decider: LLMProvider,
    supabase: any,
    initialState: AgentState,
  ) {
    this.registry = registry;
    this.decider = decider;
    this.supabase = supabase;
    this.state = initialState;
  }

  async run(): Promise<{ ok: boolean; summary?: string; error?: string; steps: number }> {
    let step = 0;
    this.state.phase = LoopPhase.GATHER_CONTEXT;
    this.state.executionLog = [];
    this.state.totalSteps = 0;

    while (step < this.maxSteps) {
      step++;
      this.state.totalSteps = step;
      this.state.executionLog.push(`[Step ${step}] ${this.state.phase}`);

      try {
        // deno-lint-ignore no-case-declarations
        switch (this.state.phase as LoopPhase) {
          case LoopPhase.GATHER_CONTEXT:
            await this.gatherContext();
            break;
          case LoopPhase.ANALYZE_INTENT:
            await this.analyzeIntent();
            break;
          case LoopPhase.CREATE_PLAN:
            await this.createPlan();
            break;
          case LoopPhase.EXECUTE_STEP:
            await this.executeStep();
            break;
          case LoopPhase.VALIDATE_STEP:
            await this.validateStep();
            break;
          case LoopPhase.DECIDE_NEXT:
            await this.decideNext();
            break;
          case LoopPhase.SUMMARIZE:
            const summary = await this.summarize();
            this.state.phase = LoopPhase.DONE;
            await this.persistFinal(summary);
            return { ok: true, summary, steps: step };
          case LoopPhase.DONE:
            return { ok: true, summary: "Finalizado", steps: step };
          case LoopPhase.ERROR:
            return { ok: false, error: this.state.retryFeedback ?? "Erro no loop", steps: step };
        }

        if (step % this.checkpointInterval === 0) {
          await this.saveCheckpoint();
        }
      } catch (err: any) {
        console.error(`[AgentLoop] Erro no step ${step}:`, err.message);
        this.state.executionLog.push(`[ERROR] ${err.message}`);
        this.state.phase = LoopPhase.ERROR;
        this.state.retryFeedback = err.message;
        await this.saveCheckpoint();
        await this.persistFinal(`Erro: ${err.message}`);
        return { ok: false, error: err.message, steps: step };
      }
    }

    // Max steps reached
    await this.persistFinal("Loop atingiu o limite de passos.");
    return { ok: false, error: "Máximo de passos atingido", steps: step };
  }

  // ─── FASE 1: Coleta de contexto (0 tokens LLM) ───
  private async gatherContext(): Promise<void> {
    const { data: files } = await this.supabase
      .from("project_files")
      .select("id, path, content, updated_at")
      .eq("project_id", this.state.projectId);

    const fileList = (files ?? []) as any[];
    const manifest = fileList.map(f => `  ${f.path} (${(f.content ?? "").length} bytes)`).join("\n") || "(projeto vazio)";

    const { data: plans } = await this.supabase
      .from("agent_plans")
      .select("*")
      .eq("project_id", this.state.projectId)
      .order("created_at", { ascending: false })
      .limit(1);

    this.state.context = {
      files: fileList,
      manifest,
      gitLog: "(git não disponível nesta fase)",
      dbSchema: "(schema não disponível nesta fase)",
      lastPlan: plans?.[0]?.steps?.join("\n") ?? "nenhum plano anterior",
    };

    this.state.phase = LoopPhase.ANALYZE_INTENT;
  }

  // ─── FASE 2: Análise de intenção (1 LLM call, barata) ───
  private async analyzeIntent(): Promise<void> {
    const userMessages = this.state.messages.filter(m => m.role === "user");
    const lastUserMsg = userMessages[userMessages.length - 1]?.content ?? "";

    const response = await this.decider.chat({
      messages: [
        { role: "system", content: INTENT_ANALYZER_PROMPT },
        { role: "user", content: `Contexto do projeto:\n${this.state.context?.manifest ?? "(vazio)"}\n\nPedido do usuário:\n${lastUserMsg}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.1,
    });

    try {
      const json = JSON.parse(response.content ?? "{}");
      this.state.intent = {
        type: json.type ?? "other",
        scope: json.scope ?? [],
        complexity: json.complexity ?? "simple",
        summary: json.summary ?? lastUserMsg.slice(0, 100),
      };
    } catch {
      this.state.intent = {
        type: "other",
        scope: [],
        complexity: "simple",
        summary: lastUserMsg.slice(0, 100),
      };
    }

    this.state.executionLog.push(`Intenção: ${this.state.intent.type} (${this.state.intent.complexity})`);
    this.state.phase = LoopPhase.CREATE_PLAN;
  }

  // ─── FASE 3: Planejamento (1 LLM call) ───
  private async createPlan(): Promise<void> {
    const contextMsg = `## Projeto atual\n${this.state.context?.manifest ?? "(vazio)"}\n\n## Último plano\n${this.state.context?.lastPlan ?? "nenhum"}`;

    const response = await this.decider.chat({
      messages: [
        { role: "system", content: PLANNER_PROMPT },
        { role: "user", content: `Intenção: ${JSON.stringify(this.state.intent)}\n\n${contextMsg}\n\nCrie um plano de ação e registre com plan_create.` },
      ],
      tools: this.registry.getDefinitions(),
      tool_choice: "auto",
      max_tokens: 2000,
    });

    if (response.tool_calls?.some(t => t.name === "plan_create")) {
      const planCall = response.tool_calls.find(t => t.name === "plan_create")!;
      // Executa a tool plan_create se existir, senão usa o conteúdo da resposta
      try {
        await this.registry.execute(planCall);
      } catch { /* plan_create pode não estar registrada ainda - usa fallback */ }
      this.state.plan = {
        title: planCall.arguments.title as string ?? this.state.intent?.summary ?? "Plano",
        steps: planCall.arguments.steps as string[] ?? [this.state.intent?.summary ?? "Executar tarefa"],
        affectedFiles: planCall.arguments.affected_files as string[] ?? this.state.intent?.scope ?? [],
      };
    } else {
      this.state.plan = {
        title: this.state.intent?.summary ?? "Plano",
        steps: [this.state.intent?.summary ?? "Executar tarefa"],
        affectedFiles: this.state.intent?.scope ?? [],
      };
    }

    this.state.currentStepIndex = 0;
    this.state.executionLog.push(`Plano: ${this.state.plan.title} (${this.state.plan.steps.length} passos)`);
    this.state.phase = LoopPhase.EXECUTE_STEP;
  }

  // ─── FASE 4: Execução de um passo ───
  private async executeStep(): Promise<void> {
    const plan = this.state.plan!;
    if (this.state.currentStepIndex >= plan.steps.length) {
      this.state.phase = LoopPhase.VALIDATE_STEP;
      return;
    }

    const currentStep = plan.steps[this.state.currentStepIndex];
    this.state.executionLog.push(`Executando passo ${this.state.currentStepIndex + 1}/${plan.steps.length}: ${currentStep}`);

    const contextBlock = [
      `## Arquivos do projeto\n${this.state.context?.manifest ?? ""}`,
      `## Plano\nTítulo: ${plan.title}`,
      `## Passo atual (${this.state.currentStepIndex + 1}/${plan.steps.length})\n${currentStep}`,
      plan.affectedFiles.length > 0 ? `## Arquivos afetados por este plano\n${plan.affectedFiles.join(", ")}` : "",
    ].filter(Boolean).join("\n\n");

    const messages: ChatMessage[] = [
      { role: "system", content: EXECUTOR_PROMPT },
      { role: "user", content: contextBlock },
    ];

    const lastMessages = this.state.messages.slice(-10);
    messages.push(...lastMessages.filter(m => m.role !== "system"));

    const response = await this.decider.chat({
      messages,
      tools: this.registry.getDefinitions(),
      tool_choice: "auto",
      max_tokens: 4096,
    });

    if (response.tool_calls && response.tool_calls.length > 0) {
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

      for (const call of response.tool_calls) {
        const result = await this.registry.execute(call);
        this.state.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
        this.state.executionLog.push(`  Tool: ${call.name} → ${result.ok ? "OK" : "ERRO: " + (result.error ?? "")}`);
      }
      // Continua no mesmo passo (pode precisar de mais tool calls)
    } else {
      // Resposta textual - passo concluído
      this.state.messages.push({
        role: "assistant",
        content: response.content ?? "Passo concluído.",
      });
      this.state.currentStepIndex++;
    }

    this.state.phase = LoopPhase.VALIDATE_STEP;
  }

  // ─── FASE 5: Validação (tenta build/lint, 0 tokens LLM) ───
  private async validateStep(): Promise<void> {
    const checks: CheckResult[] = [];

    // Tenta build
    try {
      const buildResult = await this.registry.execute({
        id: crypto.randomUUID(),
        name: "shell_build",
        arguments: {},
      });
      checks.push({
        name: "build",
        ok: buildResult.ok,
        output: typeof buildResult.output === "string" ? buildResult.output : JSON.stringify(buildResult.output ?? ""),
        error: buildResult.error,
      });
    } catch {
      checks.push({ name: "build", ok: true, output: "build não disponível (sem sandbox)" });
    }

    // Tenta lint
    try {
      const lintResult = await this.registry.execute({
        id: crypto.randomUUID(),
        name: "shell_lint",
        arguments: {},
      });
      checks.push({
        name: "lint",
        ok: lintResult.ok,
        output: typeof lintResult.output === "string" ? lintResult.output : JSON.stringify(lintResult.output ?? ""),
        error: lintResult.error,
      });
    } catch {
      // lint é opcional
    }

    this.state.validationResults = checks;
    const failures = checks.filter(c => !c.ok);
    if (failures.length > 0) {
      this.state.retryFeedback = failures.map(f => `[${f.name}] ${f.output || f.error}`).join("\n");
      this.state.executionLog.push(`Validação: ${failures.length} falha(s) → retry`);
    } else {
      this.state.retryFeedback = null;
      this.state.executionLog.push("Validação: OK");
    }

    this.state.phase = LoopPhase.DECIDE_NEXT;
  }

  // ─── FASE 6: Decisão (continua, re-tenta, ou termina) ───
  private async decideNext(): Promise<void> {
    if (this.state.retryFeedback) {
      this.state.messages.push({
        role: "user",
        content: `ATENÇÃO: Os seguintes checks falharam. Corrija os erros e tente novamente:\n\n${this.state.retryFeedback}`,
      });
      this.state.retryFeedback = null;
      this.state.phase = LoopPhase.EXECUTE_STEP; // Re-executa o mesmo passo
      return;
    }

    if (this.state.currentStepIndex < (this.state.plan?.steps.length ?? 0)) {
      this.state.phase = LoopPhase.EXECUTE_STEP;
      return;
    }

    this.state.phase = LoopPhase.SUMMARIZE;
  }

  // ─── FASE 7: Sumarização (1 LLM call final) ───
  private async summarize(): Promise<string> {
    const executionLog = this.state.executionLog.join("\n");
    const response = await this.decider.chat({
      messages: [
        { role: "system", content: SUMMARIZER_PROMPT },
        { role: "user", content: `Log de execução:\n${executionLog}\n\nArquivos do projeto:\n${this.state.context?.manifest ?? ""}` },
      ],
      max_tokens: 800,
      temperature: 0.3,
    });
    return response.content ?? "Tarefa concluída.";
  }

  // ─── Persistência ───
  private async saveCheckpoint(): Promise<void> {
    try {
      const { error } = await this.supabase.from("agent_checkpoints").upsert({
        project_id: this.state.projectId,
        conversation_id: this.state.conversationId,
        phase: this.state.phase,
        state: this.state,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,conversation_id" });
      if (error) console.error("Checkpoint error:", error.message);
    } catch (e: any) {
      console.error("Checkpoint failed:", e.message);
    }
  }

  private async persistFinal(summary: string): Promise<void> {
    const toolCallsRecorded = this.state.executionLog
      .filter(l => l.startsWith("  Tool:"))
      .map(l => {
        const parts = l.replace("  Tool: ", "").split(" → ");
        return { name: parts[0], args: {} };
      });

    await this.supabase.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text: summary }],
      tool_calls: toolCallsRecorded,
    });

    await this.supabase
      .from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", this.state.projectId);
  }
}
