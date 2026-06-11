import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapComposerMode,
  loadComposerMode,
  saveComposerMode,
} from "@/lib/composer-mode";

const PROJECT = "proj-test-uuid";

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("composer-mode", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    vi.stubGlobal("sessionStorage", createStorage());
  });

  it("default é plan quando não há persistência", () => {
    expect(loadComposerMode(PROJECT)).toBe("plan");
  });

  it("persiste escolha manual do usuário", () => {
    saveComposerMode(PROJECT, "build");
    expect(loadComposerMode(PROJECT)).toBe("build");
    saveComposerMode(PROJECT, "plan");
    expect(loadComposerMode(PROJECT)).toBe("plan");
  });

  it("bootstrap do primeiro prompt grava plan e consome sessionStorage", () => {
    bootstrapComposerMode(PROJECT, "plan");
    expect(loadComposerMode(PROJECT)).toBe("plan");
    expect(sessionStorage.getItem(`forge:composer-mode-bootstrap:${PROJECT}`)).toBeNull();
  });

  it("bootstrap não sobrescreve modo já salvo", () => {
    saveComposerMode(PROJECT, "build");
    bootstrapComposerMode(PROJECT, "plan");
    expect(loadComposerMode(PROJECT)).toBe("build");
  });
});