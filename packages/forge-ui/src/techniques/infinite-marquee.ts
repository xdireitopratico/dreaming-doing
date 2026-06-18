import type { Technique } from "./types";

/**
 * InfiniteMarquee — scroll horizontal infinito e seamless. Logos de clientes,
 * testimonials, faixas de prova social que rolam pra sempre sem corte visível.
 * Dá movimento contínuo e densidade de informação.
 */
export const INFINITE_MARQUEE: Technique = {
  id: "infinite-marquee",
  name: "InfiniteMarquee",
  concept: "Faixa rola horizontalmente pra sempre, sem corte visível — prova social contínua e densa.",
  whenToUse: "Logos de clientes, depoimentos curtos, selos/credenciais. Use 1-2 faixas, velocidade lenta (40s+).",
  pairsWith: ["count-up-metrics", "scroll-reveal"],
  primitives: ["Marquee"],
  reference: `import { Marquee } from "@forge/ui";

// O conteúdo é duplicado dentro do Marquee (ele faz o seamless). Velocidade
// alta = mais lento (40 = 40s por ciclo). reverse inverte a direção.
export function LogoMarquee({ logos }: { logos: string[] }) {
  return (
    <div className="border-y border-border bg-surface-1/50 py-8">
      <p className="mb-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
        Empresas que confiam
      </p>
      <Marquee speed={45} className="opacity-70">
        {logos.map((l) => (
          <span key={l} className="font-display text-2xl font-semibold text-muted-foreground">
            {l}
          </span>
        ))}
      </Marquee>
    </div>
  );
}`,
};
