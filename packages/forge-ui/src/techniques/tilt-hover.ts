import type { Technique } from "./types";

/**
 * TiltHover — perspectiva 3D no hover. Cartões e produtos inclinam-se
 * seguindo o cursor, como um objeto físico. Profundidade tátil que eleva
 * qualquer showcase. Combina com spotlight.
 */
export const TILT_HOVER: Technique = {
  id: "tilt-hover",
  name: "TiltHover",
  concept: "Elementos inclinam-se em 3D seguindo o cursor no hover — profundidade tátil, o card vira um objeto físico.",
  whenToUse: "Cards de produto, showcases, pricing cards, portfólio. Evite em listas densas (fica tonto).",
  pairsWith: ["spotlight-cursor", "magnetic-interaction", "glassmorphism-layers"],
  primitives: ["Tilt3D"],
  reference: `import { Tilt3D } from "@forge/ui";

// max = inclinação máxima em graus. 8 sutil, 16 dramático.
export function ProductCard({
  title,
  price,
}: {
  title: string;
  price: string;
}) {
  return (
    <Tilt3D
      max={10}
      className="rounded-2xl border border-border bg-surface-2 p-8 [transform-style:preserve-3d]"
    >
      <h3 className="font-display text-2xl font-semibold" style={{ transform: "translateZ(40px)" }}>
        {title}
      </h3>
      <p className="mt-4 text-3xl font-bold text-brand-500" style={{ transform: "translateZ(30px)" }}>
        {price}
      </p>
      {/* translateZ cria parallax DENTRO do card — elementos saltam em profundidade */}
    </Tilt3D>
  );
}`,
};
