import esbuild from "esbuild";

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
  external: ["node:*", "./agent-executor.js"],
  logLevel: "info",
});

if (result.errors.length > 0) {
  console.error("Inngest bundle failed:", result.errors);
  process.exit(1);
}
console.log("✓ Inngest handler bundled: dist/server/inngest-handler.js");