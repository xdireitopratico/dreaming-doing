import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { applyAgentProgressEvent } from "@/lib/agent-progress";
import {
  collectBuildLogLines,
  collectNativeProjectFiles,
  isNativeProjectPath,
} from "@/lib/native-build-console";

describe("native-build-console", () => {
  it("isNativeProjectPath detecta gradle e kotlin", () => {
    expect(isNativeProjectPath("app/build.gradle.kts")).toBe(true);
    expect(isNativeProjectPath("app/src/main/java/com/x/Main.kt")).toBe(true);
    expect(isNativeProjectPath("src/App.tsx")).toBe(false);
  });

  it("collectNativeProjectFiles filtra paths nativos", () => {
    const paths = collectNativeProjectFiles([
      { path: "src/App.tsx" },
      { path: "app/build.gradle.kts" },
      { path: "app/src/main/AndroidManifest.xml" },
    ]);
    expect(paths).toEqual([
      "app/build.gradle.kts",
      "app/src/main/AndroidManifest.xml",
    ]);
  });

  it("collectBuildLogLines lê build_log do progress", () => {
    let p = initialAgentProgress;
    p = applyAgentProgressEvent(p, {
      type: "build_log",
      data: {
        command: "./gradlew assembleDebug",
        lines: ["BUILD SUCCESSFUL"],
        ok: true,
      },
      timestamp: 0,
    });
    const lines = collectBuildLogLines(p);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.line).toBe("BUILD SUCCESSFUL");
  });
});