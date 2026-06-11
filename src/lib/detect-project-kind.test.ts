import { describe, expect, it } from "vitest";
import { detectProjectKind, detectProjectStack } from "./detect-project-kind";

describe("detectProjectKind", () => {
  it("returns null when empty", () => {
    expect(detectProjectKind([])).toBeNull();
  });

  it("detects mobile from package.json", () => {
    expect(
      detectProjectKind([{ path: "package.json", content: '{"dependencies":{"expo":"^52"}}' }]),
    ).toBe("mobile");
  });

  it("defaults to web for vite projects", () => {
    expect(
      detectProjectKind([
        { path: "package.json", content: '{"dependencies":{"vite":"^6"}}' },
        { path: "src/App.tsx", content: "" },
      ]),
    ).toBe("web");
  });

  it("detects android-native from gradle paths", () => {
    expect(
      detectProjectStack([
        { path: "app/build.gradle.kts", content: "" },
        { path: "app/src/main/java/com/example/MainActivity.kt", content: "" },
      ]),
    ).toBe("android-native");
  });

  it("detects mixed web + android-native", () => {
    expect(
      detectProjectStack([
        { path: "package.json", content: '{"dependencies":{"vite":"^6"}}' },
        { path: "vite.config.ts", content: "" },
        { path: "app/build.gradle.kts", content: "" },
        { path: "app/src/main/AndroidManifest.xml", content: "" },
      ]),
    ).toBe("mixed");
  });
});
