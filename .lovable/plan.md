# Genesis Forge — Home Landing

Implementação completa da visão "SpaceX × Disney × xAI". Mantém o editor (`/projects/$projectId`) intacto. Foco 100% na home pública e no design system base.

## 1. Design tokens (`src/styles.css`)

Substituir paleta atual pela Genesis Forge:

```
Dark:
--background: #111315 (oklch ~0.18 0.005 270)
--surface:    #1C1F24
--surface-2:  #24282F
--foreground: #F2F4F7
--muted:      #8A93A1

Light:
--background: #F7F5F0 (creme tecnológico)
--surface:    #FFFFFF
--foreground: #111315

Accents (compartilhados):
--ignition:   #4F8EF7 (azul de ignição — primário)
--depth:      #7C3AED (roxo de profundidade)
--live:       #10B981 (emerald — estados ao vivo)
--sun:        #F0B95C (mantido para highlights tipográficos)
```

Gradientes: `--gradient-ignition` (azul→roxo), `--gradient-aurora` (verde→azul→roxo radial), `--gradient-warp` (radial central pra transição).

Animações novas: `dw-conic-rotate` (borda gradiente girando), `dw-breath` (glassmorphism respirando), `dw-spark-burst`, `dw-warp-collapse`, `dw-grain-flicker`.

Toggle dark/light: transição 600ms com fade do cosmos.

## 2. Camada 3D — Three.js (`src/components/cosmos/`)

Instalar: `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`.

Novos arquivos:
- `Cosmos3D.tsx` — canvas R3F fixed full-screen, z-0, pointer-events-none. Substitui o `AuroraBackdrop` + `StarField` atuais.
- `StarsLayer.tsx` — 2000+ estrelas instanciadas em 3 profundidades, drift contínuo, twinkle por shader.
- `AuroraShader.tsx` — `ShaderMaterial` custom: ondas plasma verde-azul-roxo respirando (uniforms `uTime`, `uMouse`).
- `Comet.tsx` — cometa periódico cruzando a cada ~15s com trail de partículas.
- `CameraDrift.tsx` — câmera com movimento lento constante (sensação de estar *dentro*).

SSR-safe: dynamic import só no cliente, fallback gradient enquanto carrega. Respeita `prefers-reduced-motion` (canvas estático).

Remover/deprecar `StarField.tsx` (canvas 2D) e `AuroraBackdrop.tsx`. Cleanup completo de imports.

## 3. Cursor vivo (`src/components/cosmos/MagicCursor.tsx`)

- Anel externo (16px) + ponto central (4px), `position: fixed`, `mix-blend-mode: difference`.
- Tracking smoothed via rAF (lerp 0.12).
- Detecta hover em `[data-magnetic]` → cursor é atraído (distância calculada, snap parcial).
- Trilha de partículas-faísca (10 sprites) dissipando — Disney fairy dust via canvas overlay.
- Em `(pointer: coarse)` ou `reduced-motion` → desliga, cursor nativo.
- Substitui `CursorGlow.tsx`.

## 4. Parallax e tilt (`src/lib/parallax.ts` + `src/hooks/useTilt.ts`)

- Hook `useParallaxLayer(speed)` → atualiza `--px`, `--py` via mousemove (throttle rAF).
- Hook `useTilt3D()` → perspective transform em cards seguindo cursor dentro do elemento.
- Aplicado em hero (4 camadas: estrelas 8%, orbs 4%, headline 2%, foreground 1%) e pillars/showcase cards.

## 5. Tipografia cinética (`src/components/landing/KineticHeadline.tsx`)

- Cada palavra em wrapper próprio, entra com física de queda + bounce (`motion` spring stiffness 80, damping 14 — curva Disney).
- `CharReveal.tsx` — texto secundário caractere a caractere.
- `AnimatedCounter.tsx` — stats 0→N com easing ao entrar viewport.
- Marquee multi-velocidade, pause/slow on hover (mantém o atual, refina).

## 6. Hero refinado (`src/components/landing/HeroPromptBox.tsx`)

- Halo de energia ao focar (radial gradient escalando + opacity).
- Ondas de luz pulsam a cada keystroke (CSS variable + transition).
- Ao submeter: efeito **warp** — overlay full-screen com scale radial collapse pro centro, depois navega.
- Botão primário com spark burst (10 partículas explodindo via Web Animations API).

## 7. Estrutura da página (`src/routes/index.tsx`)

Sequência final:
```
MarketingShell (nav top + dark toggle)
├─ Cosmos3D (fixed bg)
├─ MagicCursor
├─ Hero            (headline cinética + prompt + parallax 4 layers)
├─ Ticker          (marquee refinado)
├─ HowItWorks      (NOVO — 3 steps com ícones animados scroll-triggered)
├─ Pillars         (cards com tilt 3D + conic border)
├─ LiveDemo        (mantém, refina com glass real)
├─ Features        (NOVO — grid com tilt 3D)
├─ Stats           (NOVO — 3 contadores animados)
├─ Templates       (NOVO — carrossel horizontal drag)
├─ ConnectorsPath  (mantém)
├─ Showcase        (mantém, aplica tilt)
├─ Pricing         (mantém)
├─ FAQ             (mantém)
└─ FinalCTA        (campo estelar intensificado)
```

Novos componentes: `HowItWorks.tsx`, `FeatureGrid.tsx`, `StatsBlock.tsx`, `TemplateCarousel.tsx`.

## 8. Glassmorphism vivo e grain

- Surfaces: `backdrop-filter: blur(20px)` + `--breath` animation oscilando blur 18↔22px (4s ease).
- Conic-gradient borders rotacionando 8s linear em painéis principais.
- Grain overlay: canvas 2D gerando noise (regenerado a cada 8 frames) em `<div fixed inset-0 mix-blend-overlay opacity-[0.04]>`.

## 9. Scroll choreography

Lenis já instalado — afinar config (duration 1.2, easing exponencial).  
Stagger via `motion` `whileInView` com `staggerChildren: 0.08` em todas as seções.  
Cada seção com parallax vertical próprio via `useScroll` + `useTransform`.

## 10. Cleanup

- Deletar: `StarField.tsx`, `AuroraBackdrop.tsx`, `CursorGlow.tsx` (substituídos).
- Manter intactos: `EditorShell.tsx`, `/projects/*`, `/auth`, `/connectors`, `/settings`, backend, auth.

## Dependências a instalar

```
three @react-three/fiber @react-three/drei @react-three/postprocessing
```

(`motion` e `lenis` já estão.)

## Detalhes técnicos críticos

- **SSR**: todos os componentes WebGL/canvas usam `typeof window !== "undefined"` guards + dynamic import com `ssr: false` via lazy + Suspense fallback.
- **Performance**: Cosmos3D pausa quando `document.hidden`; partículas com `frustumCulled`; postprocessing leve (bloom sutil só).
- **A11y**: `prefers-reduced-motion` desliga 3D animado (canvas estático), cursor mágico, parallax, warp. Tudo continua funcional.
- **Mobile (384px viewport atual)**: Cosmos3D em quality reduzida (500 estrelas, sem postprocessing, sem cometa), cursor mágico off, tilt off, parallax off. Hero compacto, marquee mantido, stats em coluna.
- **Bundle**: Three.js é pesado (~150kb gz) — code-split via dynamic import do Cosmos3D para não bloquear LCP do hero.

## Escopo desta passada

Apenas a home (`/`) e o design system (`styles.css`). Editor, auth, projetos e backend permanecem inalterados.