import "dotenv/config";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template";

async function main() {
  const tag = process.env.E2B_TEMPLATE_TAG ?? "dreaming-doing-chromium";
  console.log(`[build.prod] Building production template with tag: ${tag}`);
  await Template.build(template, tag, {
    cpuCount: 2,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log(`[build.prod] ✓ Production template built: ${tag}`);
}

main().catch((err) => {
  console.error("[build.prod] FAILED:", err);
  process.exit(1);
});
