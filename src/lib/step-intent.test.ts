import { describe, expect, it } from "vitest";
import { buildPhaseTaskTitle, describeStepExpectation } from "@/lib/step-intent";

describe("step-intent", () => {
  it("fs_read package.json — expectativa humana", () => {
    expect(describeStepExpectation("fs_read", { path: "package.json" })).toBe(
      "Entender a configuração do projeto antes de alterar",
    );
  });

  it("fs_edit Hero — interface", () => {
    expect(describeStepExpectation("fs_edit", { path: "src/Hero.tsx" })).toContain(
      "Construir a interface",
    );
  });

  it("shell build — compilação", () => {
    expect(describeStepExpectation("shell_exec", { command: "npm run build" })).toContain(
      "compila",
    );
  });

  it("phase build — task title", () => {
    expect(buildPhaseTaskTitle("build")).toBe("Implementar as mudanças pedidas");
  });
});
