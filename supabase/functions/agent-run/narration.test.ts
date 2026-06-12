import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ChatParams, ChatResponse, LLMProvider } from "./types.ts";
import {
  generateClosureMessage,
  generateLoopUpdate,
  generateOpeningMessage,
  llmChatLine,
} from "./narration.ts";

class MockLLM implements LLMProvider {
  constructor(private content: string) {}
  async chat(_p: ChatParams): Promise<ChatResponse> {
    return { role: "assistant", content: this.content, tool_calls: [] };
  }
}

class FailingLLM implements LLMProvider {
  async chat(_p: ChatParams): Promise<ChatResponse> {
    throw new Error("mock fail");
  }
}

Deno.test("generateOpeningMessage — retorna texto do LLM", async () => {
  const text = await generateOpeningMessage(
    new MockLLM("Beleza — vou montar a landing com hero e cardápio pra você."),
    {
      userSummary: "landing de cafeteria",
      intentType: "new_project",
      userRequest: "cria uma landing de cafeteria",
    },
  );
  assertStringIncludes(text!, "landing");
});

Deno.test("generateOpeningMessage — null quando LLM falha", async () => {
  const text = await generateOpeningMessage(new FailingLLM(), {
    userSummary: "x",
    userRequest: "x",
  });
  assertEquals(text, null);
});

Deno.test("generateLoopUpdate — lote de tools via LLM", async () => {
  const text = await generateLoopUpdate(
    new MockLLM("Agora leio o App.tsx e crio o Hero."),
    {
      kind: "tool_batch",
      tools: [
        { name: "fs_read", arguments: { path: "src/App.tsx" } },
        { name: "fs_write", arguments: { path: "src/Hero.tsx" } },
      ],
      allOk: true,
    },
  );
  assertStringIncludes(text!, "Hero");
});

Deno.test("generateLoopUpdate — null sem tools no batch", async () => {
  const text = await generateLoopUpdate(new MockLLM("não deveria"), {
    kind: "tool_batch",
    tools: [],
  });
  assertEquals(text, null);
});

Deno.test("generateClosureMessage — fechamento via LLM", async () => {
  const resolved = await generateClosureMessage(
    new MockLLM("Pronto — mexi no App e no Hero. Confere o preview."),
    {
      touchedPaths: ["src/App.tsx", "src/Hero.tsx"],
      priorConversation: "Montei o hero e liguei no App.",
      userRequest: "landing",
    },
  );
  assertEquals(resolved.emitExtra, true);
  assertStringIncludes(resolved.extraText!, "preview");
});

Deno.test("generateClosureMessage — vazio quando LLM falha", async () => {
  const resolved = await generateClosureMessage(new FailingLLM(), {
    touchedPaths: ["src/App.tsx"],
    userRequest: "landing",
  });
  assertEquals(resolved.emitExtra, false);
  assertEquals(resolved.text, "");
});

Deno.test("llmChatLine — rejeita resposta curta demais", async () => {
  const text = await llmChatLine(new MockLLM("ok"), "sys", "user", { minLength: 12 });
  assertEquals(text, null);
});