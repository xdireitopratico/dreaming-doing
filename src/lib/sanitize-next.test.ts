import { describe, expect, it } from "vitest";
import { parseAuthRedirect, sanitizeNext } from "./sanitize-next";

describe("sanitizeNext", () => {
  it("returns fallback for empty input", () => {
    expect(sanitizeNext()).toBe("/projects");
    expect(sanitizeNext("")).toBe("/projects");
  });

  it("strips nested auth redirect chains", () => {
    expect(sanitizeNext("/auth?next=/projects")).toBe("/projects");
    expect(sanitizeNext("/auth?next=/auth?next=/projects/abc")).toBe(
      "/projects/abc",
    );
  });

  it("allows static and project paths", () => {
    expect(sanitizeNext("/")).toBe("/");
    expect(sanitizeNext("/settings")).toBe("/settings");
    expect(sanitizeNext("/projects/pid-1")).toBe("/projects/pid-1");
    expect(sanitizeNext("/projects/pid-1/history")).toBe("/projects/pid-1/history");
  });

  it("rejects unknown paths", () => {
    expect(sanitizeNext("/unknown-page")).toBe("/projects");
  });
});

describe("parseAuthRedirect", () => {
  it("maps project paths to typed routes", () => {
    expect(parseAuthRedirect("/projects/abc")).toEqual({
      to: "/projects/$projectId",
      params: { projectId: "abc" },
    });
  });
});