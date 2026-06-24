import type { Technique } from "./types";

/**
 * PageViewTransition — transições nativas entre estados de página ou rota.
 * React 19 ViewTransition API dá morph suave entre layouts sem libs extras.
 * Respeite prefers-reduced-motion: sem animação = troca instantânea.
 */
export const PAGE_VIEW_TRANSITION: Technique = {
  id: "page-view-transition",
  name: "PageViewTransition",
  concept: "Transições nativas entre páginas ou estados — morph suave de layout sem libs extras, sensação de app premium.",
  whenToUse: "SPAs com troca de rota, tabs full-page, modais que substituem conteúdo. Sempre com fallback se prefers-reduced-motion.",
  pairsWith: ["smooth-scroll-lenis", "scroll-reveal", "kinetic-typography"],
  primitives: [],
  reference: `import { useEffect, useState, type ReactNode } from "react";
import { ViewTransition } from "react";

type Page = "home" | "about";

export function PageViewTransitionShell({ children }: { children: ReactNode }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Com reduced motion: sem ViewTransition — troca instantânea, acessível.
  if (reducedMotion) return <>{children}</>;

  return <ViewTransition>{children}</ViewTransition>;
}

// Nomeie elementos compartilhados entre rotas para morph automático.
export function RoutedHero({ page }: { page: Page }) {
  const [pageState, setPageState] = useState<Page>(page);

  const navigate = (next: Page) => {
    if (reducedMotionFallback()) {
      setPageState(next);
      return;
    }
    document.startViewTransition?.(() => setPageState(next));
  };

  return (
    <PageViewTransitionShell>
      <header>
        <h1 style={{ viewTransitionName: "hero-title" }} className="font-display text-5xl">
          {pageState === "home" ? "Dreaming" : "Doing"}
        </h1>
        <nav className="flex gap-4">
          <button type="button" onClick={() => navigate("home")}>Home</button>
          <button type="button" onClick={() => navigate("about")}>About</button>
        </nav>
      </header>
      <main style={{ viewTransitionName: "page-content" }}>
        {pageState === "home" ? <HomePanel /> : <AboutPanel />}
      </main>
    </PageViewTransitionShell>
  );
}

function reducedMotionFallback() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function HomePanel() {
  return <p className="text-muted-foreground">Conteúdo home com transição suave.</p>;
}

function AboutPanel() {
  return <p className="text-muted-foreground">Conteúdo about — morph do título compartilhado.</p>;
}`,
};