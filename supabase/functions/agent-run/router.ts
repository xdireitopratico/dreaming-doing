// router.ts — config do LLM principal (agente único; sem classify).
import type { LLMProvider } from "./types.ts";
import type { PlanRationale } from "./plan-mode.ts";
import { buildProvider, pickMain, type ProviderConfig } from "./providers.ts";

export interface ClassificationResult {
  complexity: 1 | 2 | 3 | 4 | 5;
  type: string;
  summary: string;
  needsBuild: boolean;
  needsDeps: boolean;
  plan?: PlanRationale;
}

/** Heurística leve — substitui classify LLM; alimenta maxSteps e intent. */
export function deriveClassificationFromPrompt(
  userPrompt: string,
  planMode: boolean,
): ClassificationResult {
  const text = userPrompt.trim();
  const len = text.length;
  let complexity: ClassificationResult["complexity"] = 3;
  if (len < 40) complexity = 2;
  else if (len < 120) complexity = 3;
  else if (len < 280) complexity = 4;
  else complexity = 5;

  const isDependencyRequest = /npm install|depend[eê]ncia|adiciona(r)?\s+pacote/i.test(text);
  const isFixRequest = /fix|bug|erro|corrige|corrigir/i.test(text);
  const isCreationRequest = /cri(e|ar)|implementa|monte|construa|adiciona/i.test(text);
  const isProjectRequest = /novo projeto|landing|aplicativo|app\b|site\b/i.test(text) && len >= 30;
  const isExplanatoryRequest =
    /\b(explique|explica|explique-me|como funciona|o que [eé]|quais s[aã]o|vantagens|desvantagens)\b/i
      .test(text);

  let type = "modify";
  if (isDependencyRequest) type = "add_dep";
  else if (isFixRequest) type = "fix";
  else if (isCreationRequest) {
    type = len >= 90 ? "new_project" : "modify";
  } else if (isProjectRequest) {
    type = len >= 90 ? "new_project" : "modify";
  } else if (isExplanatoryRequest) {
    type = "other";
  } else if (len < 40) type = "other";

  return {
    complexity,
    type,
    summary: text.slice(0, 200) || "Pedido do usuário",
    needsBuild: !planMode,
    needsDeps: type === "add_dep",
  };
}

export class ModelRouter {
  private main: LLMProvider;
  public mainCfg: ProviderConfig;

  constructor(
    injected?: Record<string, string>,
    overrides?: { main?: LLMProvider; cheap?: LLMProvider },
    resolvedCfg?: ProviderConfig,
  ) {
    this.mainCfg = resolvedCfg ?? pickMain(injected);
    this.main = overrides?.main ?? buildProvider(this.mainCfg);
  }

  setResolvedCfg(cfg: ProviderConfig): void {
    this.mainCfg = cfg;
  }

  selectModel(): LLMProvider {
    return this.main;
  }

  getMainProvider(): LLMProvider {
    return this.main;
  }
}
