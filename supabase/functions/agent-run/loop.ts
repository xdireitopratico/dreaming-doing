// loop.ts — AgentLoop definitivo.
// Model Router (cheap/main), Compression, Parallel Exec, Runtime Observer, Skills,
// persistência incremental de tool_calls (cada step vira uma message viva no chat).
import type {
  AgentState, LLMProvider, ChatMessage, IntentAnalysis, FileEntry, ChatResponse,
} from "./types.ts";
import { LoopPhase } from "./types.ts";

type RouterOverrides = { main?: LLMProvider; cheap?: LLMProvider };
import { ToolRegistry } from "./registry.ts";
import { ModelRouter } from "./router.ts";
import { CompressionManager, parallelExecute } from "./compression.ts";
import { RuntimeObserver } from "./observer.ts";
import { SkillRegistry } from "./skills.ts";
import { getSystemPrompt, EXECUTE_PROMPT } from "./prompts.ts";
import { getTasteStartSystemPrompt } from "./prompts-taste.ts";
import { friendlyLlmError } from "./llm-errors.ts";
import { hashToolBatch, isExecutionStuck } from "../_shared/agent-stuck.ts";
import {
  appendExecutionLogEntry,
  buildExecutionLogMeta,
} from "./executionLogMeta.ts";

type StreamCallback = (event: { type: string; data: unknown }) => void;

const CHECKPOINT_INTERVAL_STEPS = 2;
const EDGE_FUNCTION_TIMEOUT_MS = 110_000;
const STUCK_THRESHOLD = 3;

function calculateMaxSteps(complexity: 1 | 2 | 3 | 4 | 5): number {
  return complexity * 5 + 5;
}

function serializeStateForCheckpoint(state: AgentState): Record<string, unknown> {
  return {
    projectId: state.projectId,
    conversationId: state.conversationId,
    userId: state.userId,
    messages: state.messages,
    phase: state.phase,
    currentStepIndex: state.currentStepIndex,
    context: state.context,
    intent: state.intent,
    plan: state.plan,
    validationResults: state.validationResults,
    executionLog: state.executionLog,
    retryFeedback: state.retryFeedback,
    totalSteps: state.totalSteps,
  };
}

function detectRepeatedToolCalls(
  executionLog: string[],
  threshold: number = STUCK_THRESHOLD
): boolean {
  if (executionLog.length < threshold) return false;
  const recent = executionLog.slice(-threshold);
  return recent.every((entry) => entry === recent[0]);
}

export class AgentLoop {
  private reg: ToolRegistry;
  private state: AgentState;
  private llm: LLMProvider;
  private sb: any;
  private onStream: StreamCallback;
  private router: ModelRouter;
  private compression: CompressionManager;
  private observer: RuntimeObserver;
  private skills: SkillRegistry;
  private robinActive: boolean;
  private projectTemplate: string;
  private stackAddon: string;
  private maxStepsLimit: number;
  private tasteStart: boolean;
  private sessionAddon: string;
  private userSkillNames: string[];
  private resumeRun: boolean;
  private runId: string | null;
  private runStartTime: number;
  private lastCheckpointStep: number;

  constructor(
    reg: ToolRegistry,
    llm: LLMProvider,
    supabase: any,
    state: AgentState,
    onStream: StreamCallback = () => {},
    injectedKeys?: Record<string, string>,
    routerOverrides?: RouterOverrides,
    robinActive = false,
    projectTemplate = "vite-react",
    stackAddon = "",
    options?: {
      maxSteps?: number;
      tasteStart?: boolean;
      sessionAddon?: string;
      userSkillNames?: string[];
      resumeRun?: boolean;
      runId?: string | null;
    },
  ) {
    this.reg = reg;
    this.llm = llm;
    this.sb = supabase;
    this.state = state;
    this.onStream = onStream;
    this.robinActive = robinActive;
    this.projectTemplate = projectTemplate;
    this.stackAddon = stackAddon;
    this.maxStepsLimit = options?.maxSteps ?? 20;
    this.tasteStart = options?.tasteStart ?? false;
    this.sessionAddon = options?.sessionAddon ?? "";
    this.userSkillNames = options?.userSkillNames ?? [];
    this.resumeRun = options?.resumeRun ?? false;
    this.runId = options?.runId ?? null;
    this.runStartTime = Date.now();
    this.lastCheckpointStep = 0;
    this.router = new ModelRouter(injectedKeys, routerOverrides);
    this.observer = new RuntimeObserver(reg);
    this.skills = new SkillRegistry();
    this.compression = new CompressionManager(
      this.router.getCheapProvider(),
      (type, data) => this.emit(type, data),
    );
  }

  private async saveCheckpoint(phase: LoopPhase, force = false): Promise<void> {
    if (!this.runId) return;
    const step = this.state.currentStepIndex;
    if (!force && step - this.lastCheckpointStep < CHECKPOINT_INTERVAL_STEPS) return;
    if (Date.now() - this.runStartTime > EDGE_FUNCTION_TIMEOUT_MS) {
      this.emit("timeout_warning", {
        message: "Próximo do limite de tempo da Edge Function — salvando checkpoint",
        elapsedMs: Date.now() - this.runStartTime,
      });
    }
    try {
      await this.sb.from("agent_checkpoints").upsert({
        project_id: this.state.projectId,
        conversation_id: this.state.conversationId,
        phase,
        state: serializeStateForCheckpoint(this.state),
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,conversation_id" });
      this.lastCheckpointStep = step;
    } catch (err) {
      console.error("[checkpoint] falha ao salvar:", err);
    }
  }

  private async rollbackLastCommit(): Promise<void> {
    try {
      await this.reg.execute({
        id: crypto.randomUUID(),
        name: "shell_exec",
        arguments: { command: "cd /home/user && git reset --hard HEAD~1 2>&1 || true" },
      });
      this.emit("rollback", { message: "Rollback automático: último commit revertido após falha de build" });
    } catch {
      this.emit("rollback", { message: "Rollback falhou — sandbox pode não ter git" });
    }
  }

  async run(): Promise<{
    ok: boolean;
    summary?: string;
    error?: string;
    steps: number;
    resumable?: boolean;
    canceled?: boolean;
    toolsUsed?: string[];
  }> {
    if (!this.resumeRun) {
      this.state.executionLog = [];
    }
    this.compression.reset();
    const toolsUsed = new Set<string>();
    let step = 0;

    if (this.resumeRun) {
      this.appendResumeInstruction();
      this.emit("phase", {
        phase: "resume",
        message: "Retomando a partir do histórico salvo no chat…",
      });
    }

    this.emit("phase", { phase: "gather", message: "Lendo arquivos do projeto..." });
    this.emit("memory", {
      message: `Memória: ${this.state.messages.length} mensagens carregadas do projeto`,
      messageCount: this.state.messages.length,
    });
    await this.gatherContext();
    await this.saveCheckpoint(LoopPhase.GATHER_CONTEXT);

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

    this.maxStepsLimit = calculateMaxSteps(classification.complexity);
    const executionModel = this.router.selectModel(classification.complexity);
    this.emit("classify", {
      complexity: classification.complexity,
      model: classification.complexity <= 2 ? this.router.cheapCfg.label : this.router.mainCfg.label,
      summary: classification.summary,
      maxSteps: this.maxStepsLimit,
    });

    this.emit("phase", { phase: "plan", message: classification.summary, intent: this.state.intent });
    await this.saveCheckpoint(LoopPhase.CREATE_PLAN);

    let buildAttempts = 0;
    const maxRetries = 3;

    while (step < this.maxStepsLimit) {
      if (Date.now() - this.runStartTime > EDGE_FUNCTION_TIMEOUT_MS) {
        await this.saveCheckpoint(this.state.phase, true);
        await this.persistFinal(
          `Limite de tempo da Edge Function atingido (~${Math.round(EDGE_FUNCTION_TIMEOUT_MS / 1000)}s). ` +
          `Checkpoint salvo — use **Continuar** para retomar.`
        );
        return { ok: false, error: "Timeout da Edge Function", steps: step, resumable: true, toolsUsed: [...toolsUsed] };
      }

      if (await this.isCanceled()) {
        await this.persistFinal("Execução cancelada pelo usuário.");
        this.emit("canceled", { message: "Cancelado pelo usuário" });
        return {
          ok: false,
          error: "Cancelado",
          steps: Math.max(0, step),
          canceled: true,
          toolsUsed: [...toolsUsed],
        };
      }

      step++;
      this.state.currentStepIndex = step;
      this.state.totalSteps = step;
      this.state.phase = LoopPhase.EXECUTE_STEP;

      const compressed = await this.compression.compress(this.state.messages);
      let response: ChatResponse | null = null;
      try {
        response = await this.llmChat(executionModel, EXECUTE_PROMPT, compressed);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro no modelo";
        await this.saveCheckpoint(LoopPhase.ERROR, true);
        await this.persistFinal(
          `Execução pausada: ${message}\n\nSeu histórico está salvo — clique em **Continuar** no editor para retomar.`,
        );
        return { ok: false, error: message, steps: step, resumable: true, toolsUsed: [...toolsUsed] };
      }
      if (!response) break;

      this.compression.recordUsage(response.usage);

      const assistantText = (response.content ?? "").trim();
      if (assistantText) {
        this.emit("assistant_text", { text: assistantText, final: !response.tool_calls?.length });
      }

      // Sem tool_calls = resposta final
      if (!response.tool_calls || response.tool_calls.length === 0) {
        this.state.messages.push({ role: "assistant", content: response.content ?? "Concluído." });
        break;
      }

      // Proactive stuck detection: check if the same tool calls are being repeated
      if (detectRepeatedToolCalls(this.state.executionLog)) {
        this.emit("stuck", { message: "Padrão repetitivo detectado — injetando instrução para nova abordagem" });
        this.state.messages.push({
          role: "user",
          content: "ATENÇÃO: Você está repetindo as mesmas ferramentas. PARE e tente uma abordagem DIFERENTE. " +
            "Use fs_search para entender o código atual, depois fs_edit para corrigir. Não repita fs_write no mesmo arquivo.",
        });
      }

      this.emit("phase", { phase: "execute", toolCount: response.tool_calls.length });
      await this.saveCheckpoint(LoopPhase.EXECUTE_STEP);

      // Persiste tool_calls IMEDIATAMENTE para o chat ver via Realtime,
      // enquanto eles ainda estão executando (com status pending).
      const liveMsgId = await this.persistAssistantStep(response);

      const execResults = await parallelExecute(response.tool_calls, async (call) => {
        toolsUsed.add(call.name);
        this.emit("tool_start", { name: call.name, args: call.arguments });
        const result = await this.reg.execute(call);
        this.emit("tool_done", { name: call.name, ok: result.ok, error: result.error });

        if (call.name === "fs_write" && result.ok) {
          await this.reg.execute({
            id: crypto.randomUUID(),
            name: "shell_exec",
            arguments: { command: `cd /home/user && git add -A && git commit -m "${(call.arguments.path as string)}: update" 2>&1 || true` },
          });
        }
        return result;
      });

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

      const stepHash = hashToolBatch(
        response.tool_calls.map((tc) => ({ name: tc.name, arguments: tc.arguments })),
      );
      this.state.executionLog = appendExecutionLogEntry(this.state.executionLog, stepHash);

      // Coleta arquivos modificados para type-check incremental
      const modifiedFilePaths = response.tool_calls
        .filter(t => t.name === "fs_write" || t.name === "fs_edit")
        .map(t => t.arguments.path as string)
        .filter(Boolean);

      // Atualiza a mensagem persistida com o resultado (status, error, output curto)
      if (liveMsgId) {
        await this.updateAssistantStep(liveMsgId, response, execResults, step);
      }

      // Quick TypeScript check incremental (rápido, apenas arquivos modificados)
      if (modifiedFilePaths.length > 0) {
        const typeCheck = await this.observer.quickTypeCheck(modifiedFilePaths);
        if (!typeCheck.ok) {
          this.emit("typecheck_fail", {
            errors: typeCheck.errors,
            files: modifiedFilePaths,
          });
          this.state.messages.push({
            role: "user",
            content: `TYPECHECK FALHOU nos arquivos modificados:\n\n${typeCheck.errors.map(e =>
              `${e.file}:${e.line}:${e.column} - ${e.code}: ${e.message}`).join("\n")}\n\nCorrija os erros acima com fs_edit antes de continuar.`,
          });
          continue;
        }
      }

      const modifiedFiles = modifiedFilePaths.length > 0;
      if (modifiedFiles && buildAttempts < maxRetries) {
        this.state.phase = LoopPhase.VALIDATE_STEP;
        this.emit("phase", { phase: "observe", message: "Verificando build..." });
        await this.saveCheckpoint(LoopPhase.VALIDATE_STEP);
        const observation = await this.observer.observe();
        if (!observation.passed) {
          buildAttempts++;
          this.emit("validate_fail", {
            attempt: buildAttempts,
            checks: observation.checks.filter(c => !c.ok).map(c => c.name),
            feedback: observation.feedback?.slice(0, 500),
          });
          // Rollback automático antes de pedir correção
          if (buildAttempts > 1) {
            await this.rollbackLastCommit();
          }
          this.state.messages.push({
            role: "user",
            content: `VERIFICAÇÃO FALHOU (${buildAttempts}/${maxRetries}). Analise e corrija:\n\n\`\`\`\n${observation.feedback?.slice(0, 3000)}\n\`\`\`\n\nNÃO peça ajuda. Use fs_search/fs_edit para corrigir.`,
          });
          continue;
        } else {
          buildAttempts = 0;
          this.emit("validate_ok", { message: "Build OK" });
        }
      }

      // Reactive stuck detection (original)
      if (isExecutionStuck(this.state.executionLog)) {
        this.emit("stuck", { message: "Padrão repetitivo detectado — pedindo nova abordagem" });
        this.state.messages.push({
          role: "user",
          content: "Você parece estar repetindo as mesmas ações. Tente outra abordagem.",
        });
      }

      await this.saveCheckpoint(LoopPhase.DECIDE_NEXT);
    }

    if (step >= this.maxStepsLimit) {
      await this.saveCheckpoint(LoopPhase.ERROR, true);
      await this.persistFinal("Limite de passos atingido. Parei aqui — use Continuar no chat para retomar com a mesma memória.");
      return { ok: false, error: "Limite de passos", steps: step, resumable: true, toolsUsed: [...toolsUsed] };
    }

    this.state.phase = LoopPhase.SUMMARIZE;
    this.emit("phase", { phase: "summarize", message: "Finalizando..." });
    await this.saveCheckpoint(LoopPhase.SUMMARIZE, true);
    const finalMsg = this.state.messages[this.state.messages.length - 1];
    const summary = finalMsg?.content ?? "Tarefa concluída.";
    await this.persistFinal(summary);
    this.emit("done", { summary });
    return { ok: true, summary, steps: step, toolsUsed: [...toolsUsed] };
  }

  private async gatherContext(): Promise<void> {
    const { data: files } = await this.sb
      .from("project_files")
      .select("path, content, updated_at")
      .eq("project_id", this.state.projectId);

    const fileList: FileEntry[] = files ?? [];
    const manifest = fileList.map(f => `  ${f.path}`).join("\n");

    let projectConfig = "";
    const keyFiles = fileList.filter(f =>
      ["package.json", "tsconfig.json", "vite.config.ts", "tailwind.config.ts",
       "index.html", "src/App.tsx", "src/main.tsx", "src/index.css"].includes(f.path),
    );
    for (const f of keyFiles) {
      projectConfig += `\n### ${f.path}\n\`\`\`\n${(f.content ?? "").slice(0, 2000)}\n\`\`\`\n`;
    }

    const stackSkills = this.skills.detectActive(fileList).map((s) => s.name);
    const activeSkills = [...new Set([...stackSkills, ...this.userSkillNames])];
    if (activeSkills.length > 0) {
      this.emit("skills", { active: activeSkills, stack: stackSkills, user: this.userSkillNames });
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
    const base = getSystemPrompt(this.projectTemplate);
    const withStack = this.stackAddon ? `${base}\n\n${this.stackAddon}` : base;
    const tasteWrapped = this.tasteStart ? getTasteStartSystemPrompt(withStack) : withStack;
    const fullSystemPrompt = [tasteWrapped, skillPrompt, this.sessionAddon].filter(Boolean).join("\n\n");

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
    } catch (err: unknown) {
      const message = friendlyLlmError(err, this.robinActive);
      this.emit("error", { message, recoverable: true });
      throw new Error(message);
    }
  }

  private appendResumeInstruction(): void {
    const last = this.state.messages[this.state.messages.length - 1];
    if (last?.role === "user") return;
    this.state.messages.push({
      role: "user",
      content:
        "[Retomar] Continue a tarefa a partir do estado atual do projeto e do histórico acima. " +
        "Não recomece do zero; use os arquivos já criados ou alterados.",
    });
  }

  private async isCanceled(): Promise<boolean> {
    if (!this.runId) return false;
    const { data } = await this.sb
      .from("agent_runs")
      .select("canceled_at")
      .eq("id", this.runId)
      .maybeSingle();
    return !!data?.canceled_at;
  }

  private async persistAssistantStep(response: ChatResponse): Promise<string | null> {
    const tool_calls = (response.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.name,
      args: tc.arguments,
      status: "running",
    }));
    const { data } = await this.sb.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: response.content ? [{ type: "text", text: response.content }] : [],
      tool_calls,
    }).select("id").single();
    return data?.id ?? null;
  }

  private async updateAssistantStep(
    msgId: string,
    response: ChatResponse,
    execResults: Array<{ call: any; result: any }>,
    step: number,
  ): Promise<void> {
    const tool_calls = (response.tool_calls ?? []).map(tc => {
      const found = execResults.find(r => r.call.id === tc.id);
      return {
        id: tc.id,
        name: tc.name,
        args: tc.arguments,
        status: found?.result.ok ? "ok" : "error",
        error: found?.result.error ?? null,
        artifacts: found?.result.artifacts ?? [],
      };
    });
    const meta = buildExecutionLogMeta(null, this.state.executionLog, step);
    await this.sb.from("messages").update({ tool_calls, meta }).eq("id", msgId);
  }

  private async persistFinal(summary: string): Promise<void> {
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
