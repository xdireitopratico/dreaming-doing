import { describe, expect, it } from "vitest";
import { CHAT_RESPONSE_TIPS, pickChatResponseTip } from "@/lib/chat-response-tips";

describe("pickChatResponseTip", () => {
  it("retorna dica válida do array", () => {
    const tip = pickChatResponseTip(0);
    expect(CHAT_RESPONSE_TIPS).toContain(tip);
  });

  it("varia com seed", () => {
    const a = pickChatResponseTip(1);
    const b = pickChatResponseTip(2);
    expect(typeof a).toBe("string");
    expect(typeof b).toBe("string");
  });
});
