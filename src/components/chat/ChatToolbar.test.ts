import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatToolbar } from "./ChatToolbar";

type Props = {
  text: string;
  isActive?: boolean;
  align?: "start" | "end";
};

function render(props: Props): string {
  return renderToStaticMarkup(createElement(ChatToolbar, props));
}

describe("ChatToolbar — botão de copiar", () => {
  it("não renderiza quando isActive=true (turn em progresso)", () => {
    const html = render({
      text: "Vou criar a landing page agora mesmo.",
      isActive: true,
      align: "start",
    });
    expect(html).toBe("");
  });

  it("renderiza quando isActive=false e text não-vazio (turn pronto)", () => {
    const html = render({
      text: "Landing page criada com sucesso.",
      isActive: false,
      align: "start",
    });
    expect(html).toContain("chat-message-toolbar");
    expect(html).toContain("Copiar mensagem");
  });

  it("renderiza quando isActive é undefined e text não-vazio (default)", () => {
    const html = render({ text: "Mensagem normal", align: "start" });
    expect(html).toContain("chat-message-toolbar");
  });

  it("não renderiza quando text vazio (early return original)", () => {
    const html = render({ text: "", align: "start" });
    expect(html).toBe("");
  });
});
