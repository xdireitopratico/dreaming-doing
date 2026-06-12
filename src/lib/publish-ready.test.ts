import { describe, expect, it } from "vitest";
import {
  isProjectPublishReady,
  isSeedPlaceholderEntryContent,
  projectEntryPath,
} from "./publish-ready";

describe("publish-ready", () => {
  it("detecta canvas vazio no entry", () => {
    expect(isSeedPlaceholderEntryContent("export default () => <p>Canvas vazio</p>")).toBe(true);
    expect(isSeedPlaceholderEntryContent("export default function App() { return <Hero/> }")).toBe(
      false,
    );
  });

  it("detecta seed vite antigo com CTA Começar", () => {
    const legacy = `export default function App() {
      return (
        <main>
          <p>Aguardando o primeiro plano aprovado para gerar a página inicial completa.</p>
          <Button>Começar</Button>
        </main>
      );
    }`;
    expect(isSeedPlaceholderEntryContent(legacy)).toBe(true);
  });

  it("detecta seed vite mínimo (canvas vazio)", () => {
    expect(
      isSeedPlaceholderEntryContent(
        'export default function App() { return <div className="min-h-dvh" aria-hidden />; }',
      ),
    ).toBe(true);
  });

  it("entry path por stack", () => {
    expect(projectEntryPath("expo")).toBe("app/index.tsx");
    expect(projectEntryPath("web")).toBe("src/App.tsx");
    expect(projectEntryPath(null)).toBe("src/App.tsx");
  });

  it("web: bloqueia publish com App.tsx placeholder", () => {
    const files = [
      { path: "src/App.tsx", content: "export default () => <p>Canvas vazio</p>" },
      { path: "package.json", content: "{}" },
    ];
    expect(isProjectPublishReady(files, "web")).toBe(false);
  });

  it("web: libera publish com App.tsx real", () => {
    const files = [
      { path: "src/App.tsx", content: "export default function App() { return <Hero/> }" },
    ];
    expect(isProjectPublishReady(files, "web")).toBe(true);
  });

  it("expo: bloqueia com app/index.tsx placeholder", () => {
    const files = [
      {
        path: "app/index.tsx",
        content: `<Text>Canvas vazio — descreva o app no chat</Text>`,
      },
    ];
    expect(isProjectPublishReady(files, "expo")).toBe(false);
  });

  it("native: nunca publica via gate web", () => {
    const files = [{ path: "src/App.tsx", content: "export default function App() {}" }];
    expect(isProjectPublishReady(files, "android-native")).toBe(false);
    expect(isProjectPublishReady(files, "mixed")).toBe(false);
  });
});
