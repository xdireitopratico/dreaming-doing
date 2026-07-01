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
  it("pergunta em modo build segue build (composer manda)", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "O que você fez nesses 15 minutos?",
        composerMode: "build",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
      },
      d,
    );

    expect(d.insertUserMessage).toHaveBeenCalledWith(
      "conv",
      [{ type: "text", text: "O que você fez nesses 15 minutos?" }],
      { mode: "build", turnIntent: "build" },
    );
    expect(d.runAgent).toHaveBeenCalledWith("byok", "build");
  });

  it("execução explícita em modo plan permanece plan", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "Pode executar o plano completo",
        composerMode: "plan",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
      },
      d,
    );

    expect(d.runAgent).toHaveBeenCalledWith("byok", "plan");
  });

  it("composer Chat envia mode chat com pending turn (run + SSE)", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "explique o que aconteceu no último run",
        composerMode: "chat",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
      },
      d,
    );

    expect(d.beginPendingTurn).toHaveBeenCalled();
    expect(d.runAgent).toHaveBeenCalledWith("byok", "chat");
  });

  it("composer Chat aceita verbo de execução (sem bloqueio)", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "implemente o plano agora",
        composerMode: "chat",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
      },
      d,
    );

    expect(d.insertUserMessage).toHaveBeenCalled();
    expect(d.runAgent).toHaveBeenCalledWith("byok", "chat");
  });

  it("não inicia novo envio quando já há turno pendente ativo", async () => {
    const d = deps();
    const onError = vi.fn();

    await sendMessage(
      {
        text: "teste de duplicidade",
        composerMode: "chat",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: false,
        pendingTurnActive: true,
      },
      { ...d, onError },
    );

    expect(d.beginPendingTurn).not.toHaveBeenCalled();
    expect(d.insertUserMessage).not.toHaveBeenCalled();
    expect(d.runAgent).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Aguarde o turno atual terminar antes de enviar outra mensagem.",
    );
  });

  it("enfileira sem inserir no chat quando agentBusy", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "próximo passo",
        composerMode: "build",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: true,
      },
      d,
    );

    expect(d.insertUserMessage).not.toHaveBeenCalled();
    expect(d.queueMessage).toHaveBeenCalled();
    expect(d.runAgent).not.toHaveBeenCalled();
  });

  it("enfileira follow-up mesmo com turno pendente quando agentBusy", async () => {
    const d = deps();
    const onError = vi.fn();

    await sendMessage(
      {
        text: "próximo passo",
        composerMode: "build",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: true,
        pendingTurnActive: true,
      },
      { ...d, onError },
    );

    expect(d.queueMessage).toHaveBeenCalled();
    expect(d.insertUserMessage).not.toHaveBeenCalled();
    expect(d.runAgent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("fila pausada envia direto mesmo com agentBusy", async () => {
    const d = deps();

    await sendMessage(
      {
        text: "urgente",
        composerMode: "build",
        conversationId: "conv",
        projectId: "proj",
        kind: "byok",
        agentBusy: true,
        queuePaused: true,
      },
      d,
    );

    expect(d.insertUserMessage).toHaveBeenCalled();
    expect(d.queueMessage).not.toHaveBeenCalled();
  });
});
