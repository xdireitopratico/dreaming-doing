import esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/server/forge-skills", { recursive: true });
cpSync(
  "supabase/functions/_shared/forge-skills",
  "dist/server/forge-skills",
  { recursive: true },
);

const denoShimBanner = `
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
if (typeof globalThis.Deno === "undefined") {
  globalThis.Deno = {
    env: { get: (key) => process.env[key] },
    readTextFile: async (url) => readFile(fileURLToPath(url), "utf8"),
  };
}
`;

const result = await esbuild.build({
  entryPoints: ["supabase/functions/agent-run/run-executor.ts"],
  outfile: "dist/server/agent-executor.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  treeShaking: true,
  minify: false,
  sourcemap: false,
  legalComments: "none",
  packages: "external",
  external: ["node:*"],
  plugins: [
    {
      name: "deno-imports",
      setup(build) {
        build.onResolve({ filter: /^https:\/\/esm\.sh\// }, (args) => {
          if (args.path.includes("@supabase/supabase-js")) {
            return { path: "@supabase/supabase-js", external: true };
          }
          return { path: args.path, external: true };
        });
      },
    },
  ],
  banner: { js: denoShimBanner },
  logLevel: "info",
});

if (result.errors.length > 0) {
  console.error("Agent executor bundle failed:", result.errors);
  process.exit(1);
}
console.log("✓ Agent executor bundled: dist/server/agent-executor.js");