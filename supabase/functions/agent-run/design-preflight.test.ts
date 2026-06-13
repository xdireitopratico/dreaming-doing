import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  auditDesignInventory,
  buildAvailableComponentsManifest,
  needsDesignPreflight,
  runDesignPreflight,
} from "./design-preflight.ts";
import type { ToolRegistry } from "./registry.ts";

const MINIMAL_SEED = [
  {
    path: "package.json",
    content: '{"dependencies":{"@forge/ui":"file:./packages/forge-ui"}}',
  },
  { path: "packages/forge-ui/package.json", content: '{"name":"@forge/ui"}' },
  { path: "packages/forge-ui/src/index.ts", content: 'export * from "./components";' },
  { path: "src/index.css", content: "@theme { --color-brand-500: #000; }" },
  {
    path: "src/App.tsx",
    content: 'import { HeroSignature } from "@forge/ui";\nexport default () => <HeroSignature title="x" primaryCta={{ label: "Go" }} />;',
  },
];

Deno.test("auditDesignInventory — seed mínimo OK", () => {
  const r = auditDesignInventory(MINIMAL_SEED);
  assertEquals(r.ok, true);
  assertEquals(r.missing.length, 0);
});

Deno.test("auditDesignInventory — falta forge-ui", () => {
  const r = auditDesignInventory([
    { path: "package.json", content: "{}" },
    { path: "src/index.css", content: "body{}" },
  ]);
  assertEquals(r.ok, false);
  assertEquals(r.missing.some((m) => m.includes("packages/forge-ui")), true);
});

Deno.test("auditDesignInventory — avisa import profundo", () => {
  const r = auditDesignInventory([
    ...MINIMAL_SEED,
    {
      path: "src/Bad.tsx",
      content: 'import { FadeIn } from "@forge/ui/components/Motion";',
    },
  ]);
  assertEquals(r.ok, true);
  assertEquals(r.warnings.some((w) => w.includes("components/Motion")), true);
});

Deno.test("buildAvailableComponentsManifest — lista composites", () => {
  const m = buildAvailableComponentsManifest();
  assertStringIncludes(m, "HeroSignature");
  assertStringIncludes(m, 'SOMENTE de "@forge/ui"');
});

Deno.test("needsDesignPreflight — vite-react sim, android não", () => {
  assertEquals(needsDesignPreflight("vite-react"), true);
  assertEquals(needsDesignPreflight("android-native"), false);
});

Deno.test("runDesignPreflight — install + build OK", async () => {
  class MockReg {
    calls: string[] = [];
    async execute(call: { name: string; arguments: Record<string, unknown> }) {
      const cmd = String(call.arguments.command ?? "");
      this.calls.push(cmd);
      if (cmd.includes("test -e") && cmd.includes("package.json")) {
        return { toolCallId: "", ok: true, output: { stdout: "yes\n", stderr: "" } };
      }
      if (cmd.includes("test -e") && cmd.includes("node_modules")) {
        return { toolCallId: "", ok: true, output: { stdout: "no\n", stderr: "" } };
      }
      if (cmd.includes("npm install")) {
        return { toolCallId: "", ok: true, output: { stdout: "added 1 package\n", stderr: "" } };
      }
      if (cmd.includes("npm run build")) {
        return { toolCallId: "", ok: true, output: { stdout: "built in 2s\n", stderr: "" } };
      }
      return { toolCallId: "", ok: true, output: { stdout: "", stderr: "" } };
    }
  }
  const reg = new MockReg() as unknown as ToolRegistry;
  const r = await runDesignPreflight(reg);
  assertEquals(r.passed, true);
  assertEquals(r.checks.find((c) => c.name === "build")?.ok, true);
});

Deno.test("runDesignPreflight — build fail", async () => {
  class MockReg {
    async execute(call: { name: string; arguments: Record<string, unknown> }) {
      const cmd = String(call.arguments.command ?? "");
      if (cmd.includes("test -e")) {
        const yes = cmd.includes("package.json") || cmd.includes("node_modules");
        return { toolCallId: "", ok: true, output: { stdout: yes ? "yes\n" : "no\n", stderr: "" } };
      }
      if (cmd.includes("npm install")) {
        return { toolCallId: "", ok: true, output: { stdout: "ok\n", stderr: "" } };
      }
      if (cmd.includes("npm run build")) {
        return {
          toolCallId: "",
          ok: false,
          output: { stdout: "", stderr: "error TS2307: Cannot find module '@forge/ui'\n" },
        };
      }
      return { toolCallId: "", ok: true, output: { stdout: "", stderr: "" } };
    }
  }
  const reg = new MockReg() as unknown as ToolRegistry;
  const r = await runDesignPreflight(reg);
  assertEquals(r.passed, false);
  assertStringIncludes(r.feedback ?? "", "build");
});