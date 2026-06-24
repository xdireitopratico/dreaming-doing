import type { Technique } from "./types";

/**
 * VideoHeroBackground — vídeo loop no hero com poster e lazy load.
 * Impacto cinematográfico imediato. Poster obrigatório (LCP + fallback).
 * Só carrega o vídeo quando o hero entra no viewport.
 */
export const VIDEO_HERO_BACKGROUND: Technique = {
  id: "video-hero-background",
  name: "VideoHeroBackground",
  concept: "Vídeo loop no hero com poster e lazy load — impacto cinematográfico sem sacrificar LCP nem mobile.",
  whenToUse: "Heroes de marca, produto em ação, storytelling visual. Sempre poster + muted + playsInline. Respeite reduced-motion.",
  pairsWith: ["parallax-depth", "glassmorphism-layers", "scroll-reveal"],
  primitives: [],
  reference: `import { useEffect, useRef, useState } from "react";

type VideoHeroBackgroundProps = {
  src: string;
  poster: string;
  overlayClassName?: string;
};

export function VideoHeroBackground({ src, poster, overlayClassName }: VideoHeroBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // Poster estático — sem vídeo.

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad || !videoRef.current) return;
    videoRef.current.play().catch(() => {
      // Autoplay bloqueado — poster permanece visível.
    });
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className="absolute inset-0 -z-10 overflow-hidden">
      {/* Poster: LCP + fallback mobile/reduced-motion */}
      <img
        src={poster}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        fetchPriority="high"
      />
      {shouldLoad && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="none"
        />
      )}
      <div
        className={overlayClassName ?? "absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-background"}
        aria-hidden
      />
    </div>
  );
}

// Uso: hero com conteúdo sobre o vídeo.
export function VideoHero({ title, src, poster }: { title: string; src: string; poster: string }) {
  return (
    <section className="relative flex min-h-dvh items-center justify-center px-6">
      <VideoHeroBackground src={src} poster={poster} />
      <h1 className="relative z-10 max-w-4xl text-center font-display text-5xl font-semibold text-white">
        {title}
      </h1>
    </section>
  );
}`,
};