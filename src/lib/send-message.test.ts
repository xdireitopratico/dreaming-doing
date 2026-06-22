import { describe, expect, it, vi } from "vitest";
import { sendMessage, type SendMessageDeps } from "@/lib/send-message";

function deps(): SendMessageDeps {
  return {
    insertUserMessage: vi.fn(async () => ({ error: null })),
    queueMessage: vi.fn(async () => ({ ok: true })),
    runAgent: vi.fn(async () => true),
    beginPendingTurn: vi.fn(),
    clearPendingTurn: vi.fn(),
  };
}

describe("sendMessage", () => {
  it("não transforma pergunta/status em build job", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "O que você fez nesses 15 minutos?",
        composerMode: "build",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
        planAwaiting: false,
      },
      d,
    );

    expect(d.insertUserMessage).toHaveBeenCalledWith(
      "conv",
      [{ type: "text", text: "O que você fez nesses 15 minutos?" }],
      { mode: "chat", turnIntent: "chat" },
    );
    expect(d.runAgent).toHaveBeenCalledWith("byok", "chat");
  });

  it("mantém execução explícita como build", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "Pode executar o plano completo",
        composerMode: "plan",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
        planAwaiting: false,
      },
      d,
    );

    expect(d.runAgent).toHaveBeenCalledWith("byok", "build");
  });

  it("composer Chat envia mode chat sem pending turn", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "explique o que aconteceu no último run",
        composerMode: "chat",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
        planAwaiting: false,
      },
      d,
    );

    expect(d.beginPendingTurn).not.toHaveBeenCalled();
    expect(d.runAgent).toHaveBeenCalledWith("byok", "chat");
  });

  it("composer Chat bloqueia verbo de execução com toast", async () => {
    const d = deps();
    const onError = vi.fn();
    d.onError = onError;

    await sendMessage(
      {
        text: "implemente o plano agora",
        composerMode: "chat",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
        planAwaiting: false,
      },
      d,
    );

    expect(onError).toHaveBeenCalledWith("Para executar código, mude o modo para Build.");
    expect(d.insertUserMessage).not.toHaveBeenCalled();
    expect(d.runAgent).not.toHaveBeenCalled();
  });
});
