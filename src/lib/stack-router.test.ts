import { describe, expect, it } from "vitest";
import { inferStackFromPrompt, isAmbiguousMobileRequest } from "./stack-router";

describe("inferStackFromPrompt", () => {
  it("default web para landing", () => {
    expect(inferStackFromPrompt("landing de cafeteria").id).toBe("vite-react");
  });

  it("expo para react native explícito", () => {
    expect(inferStackFromPrompt("app react native com expo").id).toBe("expo");
  });

  it("android-native para kotlin", () => {
    expect(inferStackFromPrompt("app android kotlin de voz").id).toBe("android-native");
  });

  it("expo para app mobile genérico", () => {
    expect(inferStackFromPrompt("quero um app mobile de tarefas").id).toBe("expo");
  });

  it("não manda kotlin para custom", () => {
    expect(inferStackFromPrompt("hermes voice kotlin").id).toBe("android-native");
  });
});

describe("isAmbiguousMobileRequest", () => {
  it("detecta app mobile sem stack", () => {
    expect(isAmbiguousMobileRequest("app de voz para o celular")).toBe(true);
  });

  it("não qualifica se expo explícito", () => {
    expect(isAmbiguousMobileRequest("app expo de voz")).toBe(false);
  });
});


