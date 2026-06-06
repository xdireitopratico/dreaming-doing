import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { e2bPreviewUrl, normalizeProjectPath, patchViteConfigForE2b } from "./e2b.ts";
import { parseConnectProcessStream } from "./e2b-rest.ts";
import {
  detectDevCommand,
  detectDevPort,
  isCachedPreviewValid,
} from "./preview-dev.ts";

Deno.test("patchViteConfigForE2b adds allowedHosts", () => {
  const input = `export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173, hmr: { clientPort: 443 } },
});`;
  const out = patchViteConfigForE2b(input);
  assertEquals(out.includes("allowedHosts: true"), true);
});

Deno.test("e2bPreviewUrl uses port-sandboxId format", () => {
  const url = e2bPreviewUrl("abc123", 5173);
  assertEquals(url, "https://5173-abc123.e2b.app");
});

Deno.test("normalizeProjectPath prefixes /home/user", () => {
  assertEquals(normalizeProjectPath("package.json"), "/home/user/package.json");
  assertEquals(normalizeProjectPath("/src/App.tsx"), "/home/user/src/App.tsx");
});

Deno.test("detectDevPort reads vite port from package.json", () => {
  const files = [{
    path: "package.json",
    content: JSON.stringify({ scripts: { dev: "vite --port 3000" } }),
  }];
  assertEquals(detectDevPort(files), "3000");
});

Deno.test("detectDevCommand adds host for vite projects", () => {
  const files = [{
    path: "package.json",
    content: JSON.stringify({ scripts: { dev: "vite" } }),
  }];
  const cmd = detectDevCommand(files, 5173);
  assertEquals(cmd.includes("--host 0.0.0.0"), true);
  assertEquals(cmd.includes("5173"), true);
});

Deno.test("isCachedPreviewValid returns url when not expired", () => {
  const future = new Date(Date.now() + 600_000).toISOString();
  const hit = isCachedPreviewValid({
    previewUrl: "https://5173-sbx.e2b.app",
    previewExpiresAt: future,
  });
  assertEquals(hit?.url, "https://5173-sbx.e2b.app");
});

Deno.test("isCachedPreviewValid misses expired cache", () => {
  const past = new Date(Date.now() - 1_000).toISOString();
  const miss = isCachedPreviewValid({
    previewUrl: "https://5173-sbx.e2b.app",
    previewExpiresAt: past,
  });
  assertEquals(miss, null);
});

Deno.test("parseConnectProcessStream reads stdout and exit code", () => {
  const stdout = btoa("hello\n");
  const stream = [
    `{"event":{"start":{"pid":42}}}`,
    `{"event":{"data":{"stdout":"${stdout}"}}}`,
    `{"event":{"end":{"exited":true,"status":"exit status 0"}}}`,
  ].join("\n");
  const result = parseConnectProcessStream(stream);
  assertEquals(result.exitCode, 0);
  assertEquals(result.stdout, "hello\n");
});

Deno.test("parseConnectProcessStream background stops at start", () => {
  const stream = `{"event":{"start":{"pid":99}}}\n{"event":{"data":{"stdout":"${btoa("x")}"}}}`;
  const result = parseConnectProcessStream(stream, { background: true });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stdout, "");
});