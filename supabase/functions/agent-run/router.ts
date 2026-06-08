// router.ts — Model Router: classifica complexidade, roteia para o modelo certo
// e produz um PLANO RICO estruturado (Fase 4.6+). O LLM é instruído a agir como
// um colega de equipe que pensa junto — rationale amigável em PT-BR + passos
// concretos que o usuário pode revisar antes da execução.
import type { LLMProvider } from "./types.ts";
import type { PlanRationale, PlanStep, PlanStepType } from "./plan-mode.ts";
import { buildProvider, pickCheap, pickMain, type ProviderConfig } from "./providers.ts";

export interface ClassificationResult {
  complexity: 1 | 2 | 3 | 4 | 5;
  type: string;
  summary: string;
  needsBuild: boolean;
  needsDeps: boolean;
  /** Plano estruturado produzido pelo LLM (rationale + steps). Ausente se o LLM não retornou. */
  plan?: PlanRationale;
}

const VALID_STEP_TYPES = new Set<PlanStepType>([
  "create_file", "edit_file", "shell_exec", "install_dep", "observe", "custom",
]);

function coercePlanStep(raw: unknown, idx: number): PlanStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type: PlanStepType = typeof r.type === "string" && VALID_STEP_TYPES.has(r.type as PlanStepType)
    ? r.type as PlanStepType
    : "custom";
  const description = typeof r.description === "string" && r.description.trim()
    ? r.description.trim()
    : null;
  if (!description) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : `s${idx + 1}`,
    type,
    description,
    filePath: typeof r.filePath === "string" ? r.filePath : undefined,
    estimatedCost: typeof r.estimatedCost === "number" ? r.estimatedCost : 0.002,
    enabled: r.enabled !== false,
  };
}

function coerceStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  return list.length ? list : undefined;
}

function coercePhases(raw: unknown): PlanRationale["phases"] {
  if (!Array.isArray(raw)) return undefined;
  const phases: NonNullable<PlanRationale["phases"]> = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim() : `Fase ${i + 1}`;
    const goal = typeof r.goal === "string" ? r.goal.trim() : "";
    const tasks = coerceStringList(r.tasks) ?? [];
    if (!goal && tasks.length === 0) continue;
    phases.push({
      id: typeof r.id === "string" && r.id ? r.id : `p${i + 1}`,
      title,
      goal: goal || title,
      tasks: tasks.length ? tasks : [goal || title],
    });
  }
  return phases.length ? phases : undefined;
}

function coercePlan(raw: unknown): PlanRationale | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rationale = typeof r.rationale === "string" && r.rationale.trim()
    ? r.rationale.trim()
    : "";
  if (!Array.isArray(r.steps) || r.steps.length === 0) return null;
  const steps: PlanStep[] = [];
  for (let i = 0; i < r.steps.length; i++) {
    const s = coercePlanStep(r.steps[i], i);
    if (s) steps.push(s);
  }
  if (steps.length === 0) return null;
  return {
    rationale,
    steps,
    mission: typeof r.mission === "string" ? r.mission.trim() : undefined,
    objective: typeof r.objective === "string" ? r.objective.trim() : undefined,
    assumptions: coerceStringList(r.assumptions),
    outOfScope: coerceStringList(r.outOfScope),
    phases: coercePhases(r.phases),
  };
}

export class ModelRouter {
  private cheap: LLMProvider;
  private main: LLMProvider;
  public cheapCfg: ProviderConfig;
  public mainCfg: ProviderConfig;

  constructor(
    injected?: Record<string, string>,
    overrides?: { main?: LLMProvider; cheap?: LLMProvider },
  ) {
    this.mainCfg = pickMain(injected);
    this.cheapCfg = pickCheap(this.mainCfg, injected);
    this.main = overrides?.main ?? buildProvider(this.mainCfg);
    this.cheap = overrides?.cheap ?? buildProvider(this.cheapCfg);
  }

  async classify(userPrompt: string, projectContext: string): Promise<ClassificationResult> {
    try {
      const resp = await this.cheap.chat({
        messages: [
          {
            role: "system",
            content: `Você é o planejador do FORGE, um agente que constrói software junto com humanos. Sua tarefa é analisar o pedido do usuário e o contexto do projeto, e devolver APENAS um JSON válido com a classificação E um plano de ação concreto em português.

Pense no pedido como se fosse de um colega de equipe. Escreva em PT-BR, tom amigável e direto, sem ser robótico. Evite frases genéricas tipo "implementar a feature" — seja específico (qual arquivo, qual lib, qual abordagem).

SCHEMA (retorne exatamente esta forma):
{
  "complexity": 1|2|3|4|5,
  "type": "new_project" | "modify" | "fix" | "add_dep" | "other",
  "summary": "1 frase amigável, ex: 'Vou criar um componente de Toast com 4 variantes visuais e animação de entrada'",
  "needsBuild": true|false,
  "needsDeps": true|false,
  "plan": {
    "mission": "1 frase: missão do trabalho (O QUE vamos entregar)",
    "objective": "1-2 frases: objetivo mensurável",
    "rationale": "Abordagem escolhida e POR QUÊ (2-3 frases legíveis)",
    "assumptions": ["premissa 1", "premissa 2"],
    "outOfScope": ["o que NÃO faremos neste plano"],
    "phases": [
      {
        "id": "p1",
        "title": "Fase 1 — Nome",
        "goal": "objetivo da fase",
        "tasks": ["tarefa legível em PT", "outra tarefa"]
      }
    ],
    "steps": [
      {
        "id": "s1",
        "type": "create_file" | "edit_file" | "shell_exec" | "install_dep" | "observe" | "custom",
        "description": "Descrição amigável e específica em PT-BR. ex: 'Criar src/components/Toast.tsx com props {variant, message, duration} e variants success/error/warning/info'",
        "filePath": "src/components/Toast.tsx",
        "estimatedCost": 0.003
      }
    ]
  }
}

DIRETRIZES DE PLANEJAMENTO:
- 2 a 7 passos. Menos é melhor; agrupar trabalho relacionado.
- Pense na ordem natural: estrutura → tipos → implementação → validação → build.
- Para create_file/edit_file: filePath é OBRIGATÓRIO e deve apontar pro arquivo real do projeto.
- Para install_dep: use o nome do pacote na descrição (ex: "Instalar framer-motion").
- Para shell_exec: mencione o comando principal (ex: "Rodar npm run typecheck pra validar").
- Para observe: usar quando precisar ler contexto do projeto antes de editar.
- Para custom: usar quando o passo é conversacional (ex: "Tirar dúvida com o usuário sobre o design").
- Descrições SEMPRE em português, segunda pessoa do plural OU infinitivo ("Criar X", "Validar Y"). NUNCA primeira pessoa.
- Se o pedido for puramente conversacional (sem código), retorne plan com 1 passo custom.
- Se não tiver certeza do filePath, use "custom" em vez de inventar.
- rationale SEMPRE presente (string não-vazia), mesmo que curta.

Retorne APENAS o JSON. Sem markdown, sem comentários, sem texto antes/depois.`,
          },
          { role: "user", content: `Contexto do projeto (resumo):\n${projectContext.slice(0, 2000)}\n\nPedido do usuário:\n${userPrompt}` },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.2,
      });
      const j = JSON.parse(resp.content ?? "{}");
      const result: ClassificationResult = {
        complexity: Math.min(5, Math.max(1, j.complexity ?? 3)) as 1|2|3|4|5,
        type: j.type ?? "modify",
        summary: j.summary ?? userPrompt.slice(0, 100),
        needsBuild: j.needsBuild ?? false,
        needsDeps: j.needsDeps ?? false,
      };
      const plan = coercePlan(j.plan);
      if (plan) result.plan = plan;
      return result;
    } catch {
      return { complexity: 3, type: "modify", summary: userPrompt.slice(0, 100), needsBuild: true, needsDeps: false };
    }
  }

  selectModel(complexity: number): LLMProvider {
    return complexity <= 2 ? this.cheap : this.main;
  }

  getMainProvider(): LLMProvider { return this.main; }
  getCheapProvider(): LLMProvider { return this.cheap; }
}