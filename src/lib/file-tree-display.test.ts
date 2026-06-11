import { describe, expect, it } from "vitest";
import {
  FORGE_UI_BUNDLED_MARKER,
  collapseForgeUiBundle,
  isForgeUiBundlePath,
} from "@/lib/file-tree-display";

describe("collapseForgeUiBundle", () => {
  it("substitui paths do forge-ui por um único marcador", () => {
    const input = [
      "src/App.tsx",
      "packages/forge-ui/src/components/Button.tsx",
      "packages/forge-ui/package.json",
      "package.json",
    ];
    const out = collapseForgeUiBundle(input);
    expect(out).toContain("src/App.tsx");
    expect(out).toContain("package.json");
    expect(out).toContain(FORGE_UI_BUNDLED_MARKER);
    expect(out.some((p) => p.startsWith("packages/forge-ui/src/"))).toBe(false);
  });

  it("não adiciona marcador se não houver bundle", () => {
    const out = collapseForgeUiBundle(["src/App.tsx", "package.json"]);
    expect(out).not.toContain(FORGE_UI_BUNDLED_MARKER);
  });
});

describe("isForgeUiBundlePath", () => {
  it("reconhece paths do pacote embutido", () => {
    expect(isForgeUiBundlePath("packages/forge-ui/src/Button.tsx")).toBe(true);
    expect(isForgeUiBundlePath(FORGE_UI_BUNDLED_MARKER)).toBe(true);
    expect(isForgeUiBundlePath("src/App.tsx")).toBe(false);
  });
});
