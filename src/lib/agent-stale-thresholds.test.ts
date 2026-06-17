import { describe, expect, it } from "vitest";
import {
  clientStaleStreamMs,
  SERVER_QUEUE_STALE_RUN_MS,
  SERVER_STALE_RUN_MS,
} from "@/lib/agent-stale-thresholds";

describe("clientStaleStreamMs", () => {
  it("usa 8min sem fila", () => {
    expect(clientStaleStreamMs(0)).toBe(SERVER_STALE_RUN_MS);
  });

  it("usa 2min com fila pendente", () => {
    expect(clientStaleStreamMs(2)).toBe(SERVER_QUEUE_STALE_RUN_MS);
  });
});