// router.ts — Model Router: classifica complexidade e roteia para o modelo certo
// Economia de 60-70% em tokens: 70% das tarefas vão pra modelos baratos
import type { LLMProvider, ChatParams, ChatMessage, ChatResponse } from "./types.ts";
import { createLLMProvider } from "./adapters/llm.ts";

const CHEAP_PROVIDER = Deno.env.get("LLM_CHEAP_PROVIDER") || Deno.env.get("LLM_PROVIDER") || "openai";
const CHEAP_API_KEY = Deno.env.get("LLM_CHEAP_API_KEY") || Deno.env.get("LLM_API_KEY") || "";
const CHEAP_MODEL = Deno.env.get("LLM_CHEAP_MODEL") || "gpt-4o-mini";
const CHEAP_URL = Deno.env.get("LLM_CHEAP_BASE_URL") || undefined;

const MAIN_PROVIDER = Deno.env.get("LLM_PROVIDER") || "openai";
const MAIN_API_KEY = Deno.env.get("LLM_API_KEY") || "";
const MAIN_MODEL = Deno.env.get("LLM_MODEL") || "gpt-4o";
const MAIN_URL = Deno.env.get("LLM_BASE_URL") || undefined;

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

  constructor() {
    this.cheap = createLLMProvider({
      provider: CHEAP_PROVIDER,
      apiKey: CHEAP_API_KEY,
      model: CHEAP_MODEL,
      baseUrl: CHEAP_URL,
    });
    this.main = createLLMProvider({
      provider: MAIN_PROVIDER,
      apiKey: MAIN_API_KEY,
      model: MAIN_MODEL,
      baseUrl: MAIN_URL,
    });
  }

  async classify(userPrompt: string, projectContext: string): Promise<ClassificationResult> {
    try {
      const resp = await this.cheap.chat({
        messages: [
          {
            role: "system",
            content: `Classifique o pedido do usuário. Retorne APENAS JSON:
{
  "complexity": 1-5 (1=trivial, única linha. 2=simples, 1 arquivo. 3=médio, 2-5 arquivos. 4=complexo, 5-10 arquivos. 5=muito complexo, novo projeto ou 10+ arquivos),
  "type": "new_project" | "modify" | "fix" | "add_dep" | "other",
  "summary": "1 frase em português",
  "needsBuild": true|false,
  "needsDeps": true|false
}`,
          },
          {
            role: "user",
            content: `Projeto: ${projectContext.slice(0, 2000)}\n\nPedido: ${userPrompt}`,
          },
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
      return {
        complexity: 3,
        type: "modify",
        summary: userPrompt.slice(0, 100),
        needsBuild: true,
        needsDeps: false,
      };
    }
  }

  selectModel(complexity: number): LLMProvider {
    if (complexity <= 2) {
      return this.cheap;
    }
    return this.main;
  }

  getMainProvider(): LLMProvider {
    return this.main;
  }

  getCheapProvider(): LLMProvider {
    return this.cheap;
  }
}
