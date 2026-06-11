import { describe, expect, it } from "vitest";
import { buildPreviewUrl, inferProjectRoutes } from "./project-routes";

describe("inferProjectRoutes", () => {
  it("includes home and pages from src/pages", () => {
    const routes = inferProjectRoutes([
      "src/pages/index.tsx",
      "src/pages/about.tsx",
      "package.json",
    ]);
    expect(routes.map((r) => r.path)).toContain("/");
    expect(routes.map((r) => r.path)).toContain("/about");
  });
});

describe("buildPreviewUrl", () => {
  it("appends path to e2b host", () => {
    expect(buildPreviewUrl("https://5173-abc.e2b.app", "/about")).toBe(
      "https://5173-abc.e2b.app/about",
    );
  });
});
