// loop.ts — AgentLoop definitivo.
// Model Router (cheap/main), Compression, Parallel Exec, Runtime Observer, Skills,
// persistência incremental de tool_calls (cada step vira uma message viva no chat).
import type {
  AgentState, LLMProvider, ChatMessage, IntentAnalysis, FileEntry, ChatResponse, PlanStep, ProposedPlan,
} from "./types.ts";
import { LoopPhase } from "./types.ts";

type RouterOverrides = { main?: LLMProvider; cheap?: LLMProvider };
import { ToolRegistry } from "./registry.ts";
import { ModelRouter } from "./router.ts";
import { CompressionManager, parallelExecute } from "./compression.ts";
import { RuntimeObserver } from "./observer.ts";
import { SkillRegistry } from "./skills.ts";
import { getSystemPrompt, EXECUTE_RULES } from "./prompts.ts";
import {
  ANTI_LEAK_RULE,
  QUALIFY_SYSTEM,
  buildExecuteInstruction,
  extractOriginalUserRequest,
  needsQualify,
} from "./qualify.ts";
import { getTasteStartSystemPrompt } from "./prompts-taste.ts";
import { friendlyLlmError } from "./llm-errors.ts";
import { hashToolBatch, isExecutionStuck } from "../_shared/agent-stuck.ts";
import { logger } from "../_shared/logger.ts";
import {
  appendExecutionLogEntry,
  buildExecutionLogMeta,
} from "./executionLogMeta.ts";
import {
  resumeStepStart,
  serializeCheckpointPayload,
  type CheckpointExtra,
} from "./checkpoint.ts";
import {
  buildProposedPlan,
  PLAN_APPROVAL_TTL_MS,
} from "./plan-mode.ts";
import type { ClassificationResult } from "./router.ts";

type StreamCallback = (event: { type: string; data: unknown }) => void;

const CHECKPOINT_INTERVAL_STEPS = 2;

function resolveLoopBudgetMs(): number {
  const raw =
    (typeof globalThis.Deno !== "undefined" ? Deno.env.get("AGENT_LOOP_BUDGET_MS") : undefined) ??
    (typeof process !== "undefined" ? process.env.AGENT_LOOP_BUDGET_MS : undefined);
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const inngest =
    (typeof process !== "undefined" && process.env.INNGEST_EXECUTOR === "1") ||
    (typeof globalThis.Deno !== "undefined" && Deno.env.get("INNGEST_EXECUTOR") === "1");
  // Edge: ~90s; Inngest/Vercel step: ~4.5m (fits vercel maxDuration 300s).
  return inngest ? 270_000 : 90_000;
}

const LOOP_BUDGET_MS = resolveLoopBudgetMs();
function calculateMaxSteps(complexity: 1 | 2 | 3 | 4 | 5): number {
  return complexity * 5 + 5;
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
  private hasCheckpoint: boolean;
  private resumePhase: LoopPhase | null;
  private complexityScore: number;
  private runId: string | null;
  private originalUserRequest: string;
  private toolsInvoked: boolean;
  private runStartTime: number;
  private lastCheckpointStep: number;
  private planMode: boolean;

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
      hasCheckpoint?: boolean;
      resumePhase?: LoopPhase | null;
      complexityScore?: number;
      maxStepsFromCheckpoint?: number;
      runId?: string | null;
      /** Fase 4.6 plan mode: emite plan_proposed + pausa pra aprovação do usuário. */
      planMode?: boolean;
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
    this.hasCheckpoint = options?.hasCheckpoint ?? false;
    this.resumePhase = options?.resumePhase ?? null;
    this.complexityScore = options?.complexityScore ?? 3;
    if (options?.maxStepsFromCheckpoint && options.maxStepsFromCheckpoint > 0) {
      this.maxStepsLimit = options.maxStepsFromCheckpoint;
    }
    this.runId = options?.runId ?? null;
    this.planMode = options?.planMode ?? false;
    this.originalUserRequest = extractOriginalUserRequest(state.messages);
    this.toolsInvoked = false;
    this.runStartTime = Date.now();
    this.lastCheckpointStep = options?.hasCheckpoint ? (state.currentStepIndex ?? 0) : 0;
    this.router = new ModelRouter(injectedKeys, routerOverrides);
    this.observer = new RuntimeObserver(reg);
    this.skills = new SkillRegistry();
    this.compression = new CompressionManager(
      this.router.getCheapProvider(),
      (type, data) => this.emit(type, data),
    );
  }

  private loopBudgetExceeded(): boolean {
    return Date.now() - this.runStartTime > LOOP_BUDGET_MS;
  }

  private async returnResumableChunk(
    steps: number,
    toolsUsed: Set<string>,
  ): Promise<{
    ok: false;
    error: string;
    steps: number;
    resumable: true;
    toolsUsed: string[];
  }> {
    await this.saveCheckpoint(this.state.phase, true);
    this.emit("timeout_warning", {
      message: "Chunk encerrado — Inngest retoma no próximo passo",
      elapsedMs: Date.now() - this.runStartTime,
    });
    return {
      ok: false,
      error:
        `Chunk de ~${Math.round(LOOP_BUDGET_MS / 1000)}s — retomando automaticamente…`,
      steps,
      resumable: true,
      toolsUsed: [...toolsUsed],
    };
  }

  private async clearCheckpoint(): Promise<void> {
    try {
      await this.sb
        .from("agent_checkpoints")
        .delete()
        .eq("project_id", this.state.projectId)
        .eq("conversation_id", this.state.conversationId);
    } catch {
      /* não bloqueia conclusão */
    }
  }

  private async saveCheckpoint(phase: LoopPhase, force = false): Promise<void> {
    if (!this.runId) return;
    const step = this.state.currentStepIndex;
    if (!force && step - this.lastCheckpointStep < CHECKPOINT_INTERVAL_STEPS) return;
    if (Date.now() - this.runStartTime > LOOP_BUDGET_MS) {
      this.emit("timeout_warning", {
        message: "Próximo do limite de tempo da Edge Function — salvando checkpoint",
        elapsedMs: Date.now() - this.runStartTime,
      });
    }
    try {
      const extra: CheckpointExtra = {
        complexityScore: this.complexityScore,
        maxStepsLimit: this.maxStepsLimit,
      };
      await this.sb.from("agent_checkpoints").upsert({
        project_id: this.state.projectId,
        conversation_id: this.state.conversationId,
        phase,
        state: serializeCheckpointPayload(this.state, extra),
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,conversation_id" });
      this.lastCheckpointStep = step;
    } catch (err) {
      logger.error("agent.checkpoint_save_failed", {
        runId: this.runId ?? undefined,
        step,
        phase: phase as string,
        error: (err as Error)?.message,
      });
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
    totalInputTokens?: number;
    totalOutputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  }> {
    if (!this.resumeRun) {
      this.state.executionLog = [];
    }
    this.compression.reset();
    const toolsUsed = new Set<string>();
    let executionModel = this.router.selectModel(this.complexityScore);

    if (this.resumeRun && this.hasCheckpoint) {
      this.emit("phase", {
        phase: "resume",
        message:
          `Retomando do passo ${this.state.currentStepIndex}/${this.maxStepsLimit} ` +
          "(checkpoint restaurado — sem reclassificar)",
      });
      this.emit("memory", {
        message: `Checkpoint: ${this.state.messages.length} mensagens, fase ${this.resumePhase ?? this.state.phase}`,
        messageCount: this.state.messages.length,
      });
      this.emit("classify", {
        complexity: this.complexityScore,
        model: this.complexityScore <= 2 ? this.router.cheapCfg.label : this.router.mainCfg.label,
        summary: this.state.intent?.summary ?? "Retomada",
        maxSteps: this.maxStepsLimit,
        restored: true,
      });

      // Plan runs terminate after proposing (no in-memory decision wait).
      // The plan is emitted to the client via Realtime; approval/rejection
      // creates a new build run via the plan-decide server action.
    } else {
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
      if (this.loopBudgetExceeded()) {
        return this.returnResumableChunk(0, toolsUsed);
      }
      await this.saveCheckpoint(LoopPhase.GATHER_CONTEXT);

      this.emit("phase", { phase: "classify", message: "Classificando complexidade..." });
      const lastUserContent = this.state.messages.filter(m => m.role === "user").pop()?.content ?? "";
      const userPrompt = typeof lastUserContent === "string" ? lastUserContent : "";
      const classification = await this.router.classify(
        userPrompt,
        this.state.context?.projectConfig ?? "(vazio)",
      );
      if (this.loopBudgetExceeded()) {
        return this.returnResumableChunk(0, toolsUsed);
      }
      this.complexityScore = classification.complexity;
      this.state.intent = {
        type: classification.type as IntentAnalysis["type"],
        summary: classification.summary,
        scope: [],
        complexity: classification.complexity <= 2 ? "simple" : classification.complexity <= 4 ? "medium" : "complex",
      };

      this.maxStepsLimit = calculateMaxSteps(classification.complexity);
      executionModel = this.router.selectModel(classification.complexity);
      this.emit("classify", {
        complexity: classification.complexity,
        model: classification.complexity <= 2 ? this.router.cheapCfg.label : this.router.mainCfg.label,
        summary: classification.summary,
        maxSteps: this.maxStepsLimit,
      });

      this.emit("phase", {
        phase: this.planMode ? "plan" : "build",
        message: classification.summary,
        intent: this.state.intent,
      });
      await this.saveCheckpoint(LoopPhase.CREATE_PLAN);

      // Lovable-style: pedido vago → pergunta no chat (Plan e Build).
      if (this.originalUserRequest && needsQualify(this.originalUserRequest, classification)) {
        const qualifyResult = await this.runQualifyPhase(executionModel, this.originalUserRequest);
        if (qualifyResult.stopForUser) {
          const q = qualifyResult.message || "Me conte mais sobre o que você quer construir.";
          this.emit("assistant_text", { text: q, final: true });
          this.emit("gate_decision", {
            phase: "qualify",
            reason: "needsQualify triggered (explicit interaction request or vague/short prompt)",
            awaiting: true,
          });
          await this.persistFinal(q);
          await this.clearCheckpoint();
          await this.markRunStatus("awaiting_user", {
            awaitingUser: { type: "qualify", message: q.slice(0, 200) },
          });
          this.emit("done", { summary: q, qualified: true, awaiting: true });
          return { ok: true, summary: q, steps: 0, toolsUsed: [] };
        }
      }

      // Plan mode: plano na Plan view + mensagem no chat; código só após aprovação.
      if (this.planMode) {
        const proposedPlan = this.proposePlan(classification);
        const planChatText = this.buildPlanChatMessage(proposedPlan);
        this.emit("assistant_text", { text: planChatText, final: true });
        this.emit("plan_proposed", {
          planId: proposedPlan.planId,
          summary: proposedPlan.summary,
          rationale: proposedPlan.rationale,
          markdown: proposedPlan.markdown,
          mission: proposedPlan.mission,
          objective: proposedPlan.objective,
          steps: proposedPlan.steps,
          runId: this.runId,
          projectId: this.state.projectId,
        });
        logger.event("agent_run.plan_proposed", {
          runId: this.runId ?? undefined,
          planId: proposedPlan.planId,
          stepCount: proposedPlan.steps.length,
        });
        await this.persistPlanFinal(planChatText, proposedPlan);
        await this.saveCheckpoint(LoopPhase.CREATE_PLAN, true);
        await this.markRunStatus("completed", { plan: proposedPlan });
        this.emit("done", {
          summary: proposedPlan.summary,
          plan: proposedPlan,
          planProposed: true,
        });
        return {
          ok: true,
          summary: proposedPlan.summary,
          steps: 0,
          toolsUsed: [],
        };
      }
    }

    const step = this.resumeRun && this.hasCheckpoint
      ? resumeStepStart(this.resumePhase ?? this.state.phase, this.state.currentStepIndex)
      : 0;

    let buildAttempts = 0;
    const maxRetries = 3;
    let loopStep = step;

    while (loopStep < this.maxStepsLimit) {
      if (this.loopBudgetExceeded()) {
        return this.returnResumableChunk(loopStep, toolsUsed);
      }

      if (await this.isCanceled()) {
        await this.persistFinal("Execução cancelada pelo usuário.");
        this.emit("canceled", { message: "Cancelado pelo usuário" });
        return {
          ok: false,
          error: "Cancelado",
          steps: Math.max(0, loopStep),
          canceled: true,
          toolsUsed: [...toolsUsed],
        };
      }

      loopStep++;
      this.state.currentStepIndex = loopStep;
      this.state.totalSteps = this.maxStepsLimit;
      this.state.phase = LoopPhase.EXECUTE_STEP;
      this.emit("step", { current: loopStep, total: this.maxStepsLimit });
      this.emit("phase", {
        phase: "execute",
        message: `Executando passo ${loopStep}/${this.maxStepsLimit}…`,
      });

      const compressed = await this.compression.compress(this.state.messages);
      const executeInstruction = buildExecuteInstruction(this.originalUserRequest);
      const forceTools = !this.toolsInvoked && loopStep <= 3 &&
        (this.state.intent?.type === "modify" || this.state.intent?.type === "new_project" ||
          this.state.intent?.type === "fix" || this.state.intent?.type === "add_dep");
      let response: ChatResponse | null = null;
      try {
        response = await this.llmChat(executionModel, executeInstruction, compressed, forceTools);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro no modelo";
        await this.saveCheckpoint(LoopPhase.ERROR, true);
        await this.persistFinal(
          `Execução pausada: ${message}\n\nSeu histórico está salvo — clique em **Continuar** no editor para retomar.`,
        );
        return { ok: false, error: message, steps: loopStep, resumable: true, toolsUsed: [...toolsUsed] };
      }
      if (!response) break;

      this.compression.recordUsage(response.usage);

      const assistantText = (response.content ?? "").trim();
      if (assistantText) {
        this.emit("assistant_text", { text: assistantText, final: !response.tool_calls?.length });
      }

      // Sem tool_calls
      if (!response.tool_calls || response.tool_calls.length === 0) {
        if (forceTools && assistantText) {
          this.state.messages.push({ role: "assistant", content: response.content ?? assistantText });
          this.state.messages.push({
            role: "user",
            content:
              "Use ferramentas AGORA (fs_read, fs_write, fs_edit ou shell_exec). " +
              "Não responda só com texto — implemente o pedido.",
          });
          continue;
        }
        this.state.messages.push({ role: "assistant", content: response.content ?? "Concluído." });
        break;
      }

      this.toolsInvoked = true;

      this.emit("phase", { phase: "execute", toolCount: response.tool_calls.length });
      await this.saveCheckpoint(LoopPhase.EXECUTE_STEP);

      // Persiste tool_calls IMEDIATAMENTE para o chat ver via Realtime,
      // enquanto eles ainda estão executando (com status pending).
      const liveMsgId = await this.persistAssistantStep(response);

      const execResults = await parallelExecute(response.tool_calls, async (call) => {
        toolsUsed.add(call.name);

        // ─── Captura o conteúdo ANTES (para diff) antes de mutações em arquivos ───
        let preDiff: { path: string; before: string; after: string; op: "write" | "edit" } | null = null;
        if (call.name === "fs_write" || call.name === "fs_edit") {
          const filePath = (call.arguments.path as string) ?? "";
          if (filePath) {
            try {
              const { data: existing } = await this.sb
                .from("project_files")
                .select("content")
                .eq("project_id", this.state.projectId)
                .eq("path", filePath)
                .maybeSingle();
              const before = (existing?.content as string) ?? "";
              let after = before;
              if (call.name === "fs_write") {
                after = (call.arguments.content as string) ?? "";
              } else {
                const oldText = (call.arguments.oldText as string) ?? "";
                const newText = (call.arguments.newText as string) ?? "";
                const replaceAll = call.arguments.replaceAll === true;
                after = replaceAll ? before.split(oldText).join(newText) : before.replace(oldText, newText);
              }
              preDiff = { path: filePath, before, after, op: call.name === "fs_write" ? "write" : "edit" };
            } catch {
              /* não bloqueia a execução — diff é best-effort */
            }
          }
        }

        this.emit("tool_start", { name: call.name, args: call.arguments });
        const result = await this.reg.execute(call);
        this.emit("tool_done", { name: call.name, ok: result.ok, error: result.error });

        // ─── Emite o diff para o cliente APÓS tool_done (com o estado final já aplicado) ───
        if (preDiff && result.ok) {
          this.emit("file_diff", preDiff);
        }

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

      // Extra cancel check after potentially long tool execution (shell, writes, observer).
      // Combined with per-step check this makes stop responsive without full AbortSignal everywhere.
      if (await this.isCanceled()) {
        await this.persistFinal("Execução cancelada pelo usuário.");
        this.emit("canceled", { message: "Cancelado pelo usuário" });
        return {
          ok: false,
          error: "Cancelado",
          steps: Math.max(0, loopStep),
          canceled: true,
          toolsUsed: [...toolsUsed],
        };
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
        await this.updateAssistantStep(liveMsgId, response, execResults, loopStep);
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

      if (isExecutionStuck(this.state.executionLog)) {
        this.emit("stuck", { message: "Padrão repetitivo detectado — injetando instrução para nova abordagem" });
        this.state.messages.push({
          role: "user",
          content:
            "ATENÇÃO: Você está repetindo as mesmas ferramentas. PARE e tente uma abordagem DIFERENTE. " +
            "Use fs_search para entender o código atual, depois fs_edit para corrigir. Não repita fs_write no mesmo arquivo.",
        });
      }

      await this.saveCheckpoint(LoopPhase.DECIDE_NEXT);
    }

    if (loopStep >= this.maxStepsLimit) {
      await this.saveCheckpoint(LoopPhase.ERROR, true);
      await this.persistFinal("Limite de passos atingido. Parei aqui — use Continuar no chat para retomar com a mesma memória.");
      return { ok: false, error: "Limite de passos", steps: loopStep, resumable: true, toolsUsed: [...toolsUsed] };
    }

    this.state.phase = LoopPhase.SUMMARIZE;
    this.emit("phase", { phase: "summarize", message: "Finalizando..." });
    await this.saveCheckpoint(LoopPhase.SUMMARIZE, true);
    const finalMsg = this.state.messages[this.state.messages.length - 1];
    const rawSummary = finalMsg?.content;
    const summary = typeof rawSummary === "string"
      ? rawSummary
      : Array.isArray(rawSummary)
        ? rawSummary.filter((b): b is { type: string; text?: string } => !!(b as any)?.text)
            .map((b) => (b as any).text).join("\n")
        : "Tarefa concluída.";
    await this.persistFinal(summary);
    await this.clearCheckpoint();
    const tokens = this.compression.getTotalTokens();
    const costUsd = this.compression.getEstimatedCostUsd(this.router.mainCfg.model);
    this.emit("done", {
      summary,
      totalInputTokens: tokens.input,
      totalOutputTokens: tokens.output,
      totalTokens: tokens.total,
      costUsd,
    });
    return {
      ok: true,
      summary,
      steps: loopStep,
      toolsUsed: [...toolsUsed],
      totalInputTokens: tokens.input,
      totalOutputTokens: tokens.output,
      totalTokens: tokens.total,
      costUsd,
    };
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

  /**
   * Constrói um ProposedPlan rico a partir da resposta do classificador.
   * Usa a nova cadeia de prioridade:
   *  1) classification.plan (LLM estruturado: rationale + steps) — caminho preferencial
   *  2) rawContent (LLM seguiu parcialmente) — fallback robusto
   *  3) deriveDefaultPlan (heurística) — último recurso
   */
  private proposePlan(classification: ClassificationResult): ProposedPlan {
    return buildProposedPlan(classification, null, {
      planId: crypto.randomUUID(),
      ttlMs: PLAN_APPROVAL_TTL_MS,
      proposedAt: new Date().toISOString(),
    });
  }

  /**
   * Atualiza agent_runs.status e meta. Best-effort.
   * Status possíveis: running, completed, awaiting_user.
   * Em plan mode, marca a run como completed com `plan` em meta.
   */
  private async markRunStatus(
    status: "running" | "completed" | "awaiting_user",
    extra?: { plan?: ProposedPlan | null; awaitingUser?: Record<string, unknown> },
  ): Promise<void> {
    if (!this.runId) return;
    try {
      const { data: existing } = await this.sb
        .from("agent_runs")
        .select("meta")
        .eq("id", this.runId)
        .maybeSingle();
      const prevMeta = (existing?.meta ?? {}) as Record<string, unknown>;
      const nextMeta: Record<string, unknown> = { ...prevMeta, planMode: this.planMode };
      if (extra && Object.prototype.hasOwnProperty.call(extra, "plan")) {
        if (extra.plan === null) {
          delete nextMeta.plan;
        } else if (extra.plan) {
          nextMeta.plan = extra.plan;
        }
      }
      if (extra?.awaitingUser) {
        nextMeta.awaitingUser = extra.awaitingUser;
      }
      const updateFields: Record<string, unknown> = { status, meta: nextMeta };
      if (status === "completed" || status === "running") {
        updateFields.finished_at = new Date().toISOString();
      }
      await this.sb
        .from("agent_runs")
        .update(updateFields)
        .eq("id", this.runId);
    } catch (err) {
      logger.error("agent_run.mark_status_failed", {
        runId: this.runId,
        status,
        error: (err as Error)?.message,
      });
    }
  }

  private async runQualifyPhase(
    model: LLMProvider,
    userRequest: string,
  ): Promise<{ stopForUser: boolean; message: string }> {
    this.emit("phase", {
      phase: "qualify",
      message: "Qualificando ideia antes de codar…",
    });
    try {
      const resp = await model.chat({
        messages: [
          { role: "system", content: `${QUALIFY_SYSTEM}\n\n${ANTI_LEAK_RULE}` },
          {
            role: "user",
            content: `Pedido do usuário:\n${userRequest}\n\nContexto:\n${this.state.context?.projectConfig?.slice(0, 1500) ?? "(novo)"}`,
          },
        ],
        max_tokens: 800,
        temperature: 0.4,
      });
      const message = (resp.content ?? "").trim() ||
        "Ok — me conte em uma frase o que você quer construir e para quem.";
      return { stopForUser: true, message };
    } catch {
      return { stopForUser: false, message: "" };
    }
  }

  private async llmChat(
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
    forceTools = false,
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
    const fullSystemPrompt = [
      tasteWrapped,
      skillPrompt,
      this.sessionAddon,
      EXECUTE_RULES,
      ANTI_LEAK_RULE,
    ].filter(Boolean).join("\n\n");

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
        tool_choice: forceTools ? "required" : "auto",
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

  private buildPlanChatMessage(plan: ProposedPlan): string {
    return [
      `**${plan.summary}**`,
      "",
      "Abri o **plano completo** para você revisar (Missão, Objetivo, Fases e Fora do escopo).",
      "Edite se quiser e clique em **Aprovar e construir** quando estiver pronto.",
    ].join("\n");
  }

  private async persistFinal(summary: string): Promise<void> {
    const meta: Record<string, unknown> = {
      runId: this.runId ?? undefined,
      executionLog: this.state.executionLog,
      finishedAt: new Date().toISOString(),
    };
    await this.sb.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text: summary }],
      tool_calls: [],
      meta,
    });
    await this.sb.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", this.state.projectId);
  }

  private async persistPlanFinal(summary: string, plan: ProposedPlan): Promise<void> {
    const meta: Record<string, unknown> = {
      runId: this.runId ?? undefined,
      projectId: this.state.projectId,
      planMode: true,
      planStatus: "pending",
      planId: plan.planId,
      planSummary: plan.summary,
      planRationale: plan.rationale ?? null,
      planMission: plan.mission ?? null,
      planObjective: plan.objective ?? null,
      planMarkdown: plan.markdown ?? null,
      planAssumptions: plan.assumptions ?? null,
      planOutOfScope: plan.outOfScope ?? null,
      planPhases: plan.phases ?? null,
      planSteps: plan.steps,
      finishedAt: new Date().toISOString(),
    };
    await this.sb.from("messages").insert({
      conversation_id: this.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text: summary }],
      tool_calls: [],
      meta,
    });
    await this.sb.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", this.state.projectId);
  }

  private emit(type: string, data: unknown): void {
    this.onStream({ type, data });
  }
}
