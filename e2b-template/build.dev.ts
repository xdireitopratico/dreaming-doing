import "dotenv/config";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template";

async function main() {
  const tag = process.env.E2B_TEMPLATE_TAG ?? "dreaming-doing-chromium-dev";
  console.log(`[build.dev] Building template with tag: ${tag}`);
  await Template.build(template, tag, {
    cpuCount: 2,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log(`[build.dev] ✓ Template built: ${tag}`);
}

main().catch((err) => {
  console.error("[build.dev] FAILED:", err);
  process.exit(1);
});
