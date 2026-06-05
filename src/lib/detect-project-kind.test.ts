import { describe, expect, it } from "vitest";
import { detectProjectKind } from "./detect-project-kind";

describe("detectProjectKind", () => {
  it("returns null when empty", () => {
    expect(detectProjectKind([])).toBeNull();
  });

  it("detects mobile from package.json", () => {
    expect(
      detectProjectKind([
        { path: "package.json", content: '{"dependencies":{"expo":"^52"}}' },
      ]),
    ).toBe("mobile");
  });

  it("defaults to web for vite projects", () => {
    expect(
      detectProjectKind([
        { path: "package.json", content: '{"dependencies":{"vite":"^6"}}' },
        { path: "src/App.tsx", content: "" },
      ]),
    ).toBe("web");
  });
});