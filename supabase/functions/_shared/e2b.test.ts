import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { patchViteConfigForE2b } from "./e2b.ts";

Deno.test("patchViteConfigForE2b adds allowedHosts", () => {
  const input = `export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173, hmr: { clientPort: 443 } },
});`;
  const out = patchViteConfigForE2b(input);
  assertEquals(out.includes("allowedHosts: true"), true);
});