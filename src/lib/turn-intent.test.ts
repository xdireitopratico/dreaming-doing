import { describe, expect, it } from "vitest";
import { resolveTurnIntent } from "@/lib/turn-intent";

describe("resolveTurnIntent", () => {
  it("roteia pergunta/status para chat mesmo quando o composer está em build", () => {
    expect(
      resolveTurnIntent({
        text: "qual a raiz do problema da timeline hoje?",
        composerMode: "build",
      }),
    ).toMatchObject({ kind: "chat", runMode: "chat" });
  });

  it("respeita comando explícito para não programar", () => {
    expect(
      resolveTurnIntent({
        text: "PROIBIDO PROGRAMAR, quero por escrito uma proposta qualificada",
        composerMode: "build",
      }),
    ).toMatchObject({ kind: "chat", runMode: "chat" });
  });

  it("roteia execução explícita para build", () => {
    expect(
      resolveTurnIntent({
        text: "Pode executar o plano completo do 1 ao 10",
        composerMode: "plan",
      }),
    ).toMatchObject({ kind: "build", runMode: "build" });
  });

  it("mantém plan para pedido formal de planejamento", () => {
    expect(
      resolveTurnIntent({
        text: "monte um plano robusto antes de executar",
        composerMode: "plan",
      }),
    ).toMatchObject({ kind: "plan", runMode: "plan" });
  });
});
