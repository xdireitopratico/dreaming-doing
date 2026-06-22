import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assembleGatherContext,
  buildProjectConfigFromFiles,
  buildSkillsStreamPayload,
  shouldEmitSkillsEvent,
} from "./gather-context.ts";

Deno.test("buildProjectConfigFromFiles — inclui package.json", () => {
  const config = buildProjectConfigFromFiles([
    { path: "package.json", content: '{"name":"demo"}' },
    { path: "src/App.tsx", content: "export default function App(){}" },
    { path: "README.md", content: "hi" },
  ]);
  assertEquals(config.includes("package.json"), true);
  assertEquals(config.includes("src/App.tsx"), true);
  assertEquals(config.includes("README.md"), false);
});

Deno.test("shouldEmitSkillsEvent — dedupe por JSON igual", () => {
  assertEquals(shouldEmitSkillsEvent(["lint"], null), true);
  assertEquals(shouldEmitSkillsEvent(["lint"], ["lint"]), false);
  assertEquals(shouldEmitSkillsEvent([], ["lint"]), false);
});

Deno.test("assembleGatherContext — monta context e skills", () => {
  const result = assembleGatherContext({
    fileList: [
      { path: "package.json", content: '{"name":"demo"}' },
      { path: "src/App.tsx", content: "export default function App() { return <main>Meu app</main>; }" },
    ],
    messages: [],
    userSkillNames: ["design"],
    lastEmittedSkills: null,
    stackSkillNames: ["react"],
  });
  assertEquals(result.context.files.length, 2);
  assertEquals(result.context.manifest.includes("src/App.tsx"), true);
  assertEquals(result.cacheEntries.length, 2);
  assertEquals(result.skillsEvent?.invoked, ["design"]);
  assertEquals(result.skillsEvent?.stack, ["react"]);
});

Deno.test("buildSkillsStreamPayload — invoked único", () => {
  const payload = buildSkillsStreamPayload(["a", "a", "b"], ["react"]);
  assertEquals(payload.invoked, ["a", "b"]);
  assertEquals(payload.active, ["a", "b"]);
});