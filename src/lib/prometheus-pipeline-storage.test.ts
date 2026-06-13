import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  migrateLegacyPrometheusStorage,
  psStorageKey,
  purgeOrphanPrometheusStorage,
  readPsPipelineField,
} from "./prometheus-pipeline-storage";

const PROJECT = "11111111-1111-1111-1111-111111111111";

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    _map: map,
  };
}

describe("prometheus-pipeline-storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("psStorageKey requires projectId", () => {
    expect(psStorageKey(PROJECT, "phase")).toBe(`ps_phase_${PROJECT}`);
    expect(psStorageKey(undefined, "phase")).toBeNull();
  });

  it("migrates vibrant globals into scoped keys", () => {
    localStorage.setItem("ps_phase", "boardroom");
    localStorage.setItem("ps_prompt", "meu agente de suporte");

    migrateLegacyPrometheusStorage(PROJECT);

    expect(readPsPipelineField(PROJECT, "phase")).toBe("boardroom");
    expect(readPsPipelineField(PROJECT, "prompt")).toBe("meu agente de suporte");
    expect(localStorage.getItem("ps_phase")).toBeNull();
    expect(localStorage.getItem("ps_prompt")).toBeNull();
  });

  it("purge removes ps_onboarding_* and bare globals", () => {
    localStorage.setItem("ps_onboarding_abc", "{}");
    localStorage.setItem("ps_phase", "home");
    localStorage.setItem(`ps_phase_${PROJECT}`, "boardroom");

    purgeOrphanPrometheusStorage();

    expect(localStorage.getItem("ps_onboarding_abc")).toBeNull();
    expect(localStorage.getItem("ps_phase")).toBeNull();
    expect(localStorage.getItem(`ps_phase_${PROJECT}`)).toBe("boardroom");
  });
});