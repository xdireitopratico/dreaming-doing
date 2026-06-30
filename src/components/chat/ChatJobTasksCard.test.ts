import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatJobTasksCard } from "./ChatJobTasksCard";
import type { MiniCardData, RunPhase } from "@/lib/chat/types";

function render(data: MiniCardData, phase: RunPhase | "preflight" | null): string {
  return renderToStaticMarkup(
    createElement(ChatJobTasksCard, {
      data,
      phase,
      isFocused: false,
    }),
  );
}

function baseData(): MiniCardData {
  return {
    title: "Run",
    header: "Working",
    subtitle: "",
    liveBriefings: [],
    liveLine: "",
    status: "working",
    activity: [],
  };
}

describe("ChatJobTasksCard", () => {
  it("não mostra skeleton em preflight sem tarefas materializadas", () => {
    const html = render(baseData(), "preflight");
    expect(html).toBe("");
  });

  it("mostra skeleton apenas nas fases de materialização de tarefas", () => {
    const html = render(baseData(), "build");
    expect(html).toContain("Preparing tasks…");
    expect(html).toContain("forge-job-tasks-dock");
  });
});
