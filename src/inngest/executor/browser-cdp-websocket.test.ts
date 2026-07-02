import { describe, it, expect } from "vitest";
import {
  buildCdpCommand,
  isBrowserLevelCdpMethod,
  pickPageSessionId,
} from "./browser-cdp-websocket";

describe("browser-cdp-websocket — CDP flatten helpers (G4)", () => {
  it("isBrowserLevelCdpMethod identifica Target.* e Browser.*", () => {
    expect(isBrowserLevelCdpMethod("Target.attachToTarget")).toBe(true);
    expect(isBrowserLevelCdpMethod("Browser.getVersion")).toBe(true);
    expect(isBrowserLevelCdpMethod("Page.navigate")).toBe(false);
    expect(isBrowserLevelCdpMethod("Runtime.evaluate")).toBe(false);
  });

  it("buildCdpCommand anexa sessionId em comandos de página", () => {
    const cmd = buildCdpCommand(3, "Page.captureScreenshot", { format: "png" }, "sess-1");
    expect(cmd.sessionId).toBe("sess-1");
    expect(cmd.method).toBe("Page.captureScreenshot");
  });

  it("buildCdpCommand não anexa sessionId em Target.*", () => {
    const cmd = buildCdpCommand(2, "Target.attachToTarget", { targetId: "p1" }, "sess-1");
    expect(cmd.sessionId).toBeUndefined();
  });

  it("pickPageSessionId escolhe sessão do primeiro page target", () => {
    const session = pickPageSessionId(
      [
        { id: "bg-1", type: "background_page" },
        { id: "page-1", type: "page" },
      ],
      [{ targetId: "page-1", sessionId: "sess-page" }],
    );
    expect(session).toBe("sess-page");
  });

  it("pickPageSessionId retorna null sem page target", () => {
    expect(
      pickPageSessionId([{ id: "bg-1", type: "background_page" }], []),
    ).toBeNull();
  });
});