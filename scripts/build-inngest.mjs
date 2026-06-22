import esbuild from "esbuild";
import { resolve } from "node:path";

const root = resolve(process.cwd());

const result = await esbuild.build({
  entryPoints: ["src/inngest/handler.ts"],
  outfile: "dist/server/inngest-handler.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  treeShaking: true,
  minify: false,
  sourcemap: false,
  legalComments: "none",
  packages: "external",
  external: ["node:*", "./agent-executor.js", "inngest", "@supabase/supabase-js"],
  alias: {
    "@forge/agent-contract/lifecycle": resolve(
      root,
      "packages/agent-contract/src/lifecycle.ts",
    ),
    "@forge/agent-contract/events": resolve(root, "packages/agent-contract/src/events.ts"),
    "@forge/agent-contract": resolve(root, "packages/agent-contract/src/index.ts"),
  },
  logLevel: "info",
});

if (result.errors.length > 0) {
  console.error("Inngest bundle failed:", result.errors);
  process.exit(1);
}
console.log("✓ Inngest handler bundled: dist/server/inngest-handler.js");
