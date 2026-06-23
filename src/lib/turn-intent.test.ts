import { describe, expect, it } from "vitest";
import { resolveTurnIntent } from "@/lib/turn-intent";

describe("resolveTurnIntent", () => {
  it("obedece o composer — build não vira chat por pergunta", () => {
    expect(
      resolveTurnIntent({
        text: "qual a raiz do problema da timeline hoje?",
        composerMode: "build",
      }),
    ).toMatchObject({ kind: "build", runMode: "build", reason: "composer_build_mode" });
  });

  it("obedece o composer — plan não vira build por verbo de ação", () => {
    expect(
      resolveTurnIntent({
        text: "Pode executar o plano completo do 1 ao 10",
        composerMode: "plan",
      }),
    ).toMatchObject({ kind: "plan", runMode: "plan", reason: "composer_plan_mode" });
  });

  it("mantém plan para pedido formal de planejamento", () => {
    expect(
      resolveTurnIntent({
        text: "monte um plano robusto antes de executar",
        composerMode: "plan",
      }),
    ).toMatchObject({ kind: "plan", runMode: "plan", reason: "composer_plan_mode" });
  });

  it("composer Plan não vira build só por verbo criar", () => {
    expect(
      resolveTurnIntent({
        text: "crie um plano detalhado para a landing",
        composerMode: "plan",
      }),
    ).toMatchObject({ kind: "plan", runMode: "plan", reason: "composer_plan_mode" });
  });

  it("composer Chat força runMode chat", () => {
    expect(
      resolveTurnIntent({
        text: "qual a raiz do problema da timeline?",
        composerMode: "chat",
      }),
    ).toMatchObject({ kind: "chat", runMode: "chat", reason: "composer_chat_mode" });
  });

  it("composer Chat não vira build mesmo com verbo de ação", () => {
    expect(
      resolveTurnIntent({
        text: "crie um botão vermelho no hero",
        composerMode: "chat",
      }),
    ).toMatchObject({ kind: "chat", runMode: "chat", reason: "composer_chat_mode" });
  });

  it("explicitMode sobrescreve composer", () => {
    expect(
      resolveTurnIntent({
        text: "implemente agora",
        composerMode: "chat",
        explicitMode: "build",
      }),
    ).toMatchObject({ kind: "build", runMode: "build", reason: "composer_build_mode" });
  });

  it("mensagem vazia sem anexo → chat", () => {
    expect(
      resolveTurnIntent({
        text: "   ",
        composerMode: "build",
      }),
    ).toMatchObject({ kind: "chat", runMode: "chat", reason: "empty" });
  });
});