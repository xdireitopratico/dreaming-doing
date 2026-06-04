// router.ts — Model Router: classifica complexidade e roteia para o modelo certo.
// Sem dependência de envs LLM_* específicos: usa o que provider auto-detect retornou.
import type { LLMProvider } from "./types.ts";
import { buildProvider, pickCheap, pickMain, type ProviderConfig } from "./providers.ts";

export interface ClassificationResult {
  complexity: 1 | 2 | 3 | 4 | 5;
  type: string;
  summary: string;
  needsBuild: boolean;
  needsDeps: boolean;
}

export class ModelRouter {
  private cheap: LLMProvider;
  private main: LLMProvider;
  public cheapCfg: ProviderConfig;
  public mainCfg: ProviderConfig;

  constructor() {
    this.mainCfg = pickMain();
    this.cheapCfg = pickCheap(this.mainCfg);
    this.main = buildProvider(this.mainCfg);
    this.cheap = buildProvider(this.cheapCfg);
  }

  async classify(userPrompt: string, projectContext: string): Promise<ClassificationResult> {
    try {
      const resp = await this.cheap.chat({
        messages: [
          {
            role: "system",
            content: `Classifique o pedido. Retorne APENAS JSON válido:
{
  "complexity": 1-5 (1=trivial, 5=novo projeto/10+ arquivos),
  "type": "new_project" | "modify" | "fix" | "add_dep" | "other",
  "summary": "1 frase em português",
  "needsBuild": true|false,
  "needsDeps": true|false
}`,
          },
          { role: "user", content: `Projeto: ${projectContext.slice(0, 2000)}\n\nPedido: ${userPrompt}` },
        ],
        response_format: { type: "json_object" },
        max_tokens: 200,
        temperature: 0,
      });
      const j = JSON.parse(resp.content ?? "{}");
      return {
        complexity: Math.min(5, Math.max(1, j.complexity ?? 3)) as 1|2|3|4|5,
        type: j.type ?? "modify",
        summary: j.summary ?? userPrompt.slice(0, 100),
        needsBuild: j.needsBuild ?? false,
        needsDeps: j.needsDeps ?? false,
      };
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
