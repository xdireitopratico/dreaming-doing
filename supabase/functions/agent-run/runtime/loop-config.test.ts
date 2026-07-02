import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AGENT_MAX_STEPS,
  calculateMaxSteps,
  calculateMaxTokens,
  capMetaSize,
  isAndroidNativePath,
  isBuildCommand,
  isGradleCommand,
  META_MAX_BYTES,
  resolveLoopBudgetMs,
} from "./loop-config.ts";

Deno.test("isBuildCommand — gradle e npm run build", () => {
  assertEquals(isGradleCommand("./gradlew assembleDebug"), true);
  assertEquals(isBuildCommand("npm run build"), true);
  assertEquals(isBuildCommand("echo hello"), false);
});

Deno.test("isAndroidNativePath — manifest e gradle", () => {
  assertEquals(isAndroidNativePath("app/src/main/AndroidManifest.xml"), true);
  assertEquals(isAndroidNativePath("src/App.tsx"), false);
});

Deno.test("resolveLoopBudgetMs — edge vs inngest", () => {
  assertEquals(resolveLoopBudgetMs({}), 90_000);
  assertEquals(resolveLoopBudgetMs({ inngestExecutor: "1" }), 270_000);
  assertEquals(resolveLoopBudgetMs({ agentLoopBudgetMs: "120000" }), 120_000);
});

Deno.test("calculateMaxSteps — fusível único 100", () => {
  assertEquals(AGENT_MAX_STEPS, 100);
  assertEquals(calculateMaxSteps(1), 100);
  assertEquals(calculateMaxSteps(3), 100);
  assertEquals(calculateMaxSteps(5), 100);
});

Deno.test("calculateMaxTokens por complexidade", () => {
  assertEquals(calculateMaxTokens(5), 32768);
});

Deno.test("capMetaSize — trunca executionLog e streamTail", () => {
  const bigLog = Array.from({ length: 50 }, (_, i) => ({ step: i }));
  const meta: Record<string, unknown> = {
    executionLog: bigLog,
    streamTail: "x".repeat(5000),
    cardSnapshot: { timeline: Array.from({ length: 50 }, (_, i) => ({ i })) },
    filler: "y".repeat(META_MAX_BYTES),
  };
  const capped = capMetaSize(meta);
  assertEquals((capped.executionLog as unknown[]).length, 20);
  assertEquals((capped.streamTail as string).length, 2000);
  const snapshot = capped.cardSnapshot as { timeline?: unknown[] };
  assertEquals(snapshot.timeline?.length, 30);
});
