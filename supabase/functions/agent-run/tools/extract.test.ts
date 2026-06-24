import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PLAN_EXTRACT_DNA_QUOTA,
  planExtractQuotaError,
  resolveExtractDepth,
} from "./extract.ts";

Deno.test("resolveExtractDepth — Plan força shallow (H39)", () => {
  assertEquals(resolveExtractDepth(true, "deep"), "shallow");
  assertEquals(resolveExtractDepth(false, "deep"), "deep");
  assertEquals(resolveExtractDepth(false), "shallow");
});

Deno.test("planExtractQuotaError — bloqueia após quota Plan (H39)", () => {
  assertEquals(planExtractQuotaError(1, true), null);
  assertEquals(planExtractQuotaError(PLAN_EXTRACT_DNA_QUOTA, true), null);
  assertEquals(
    planExtractQuotaError(PLAN_EXTRACT_DNA_QUOTA + 1, true),
    `Quota Plan: máximo ${PLAN_EXTRACT_DNA_QUOTA} chamadas extract_design_dna por run`,
  );
  assertEquals(planExtractQuotaError(99, false), null);
});