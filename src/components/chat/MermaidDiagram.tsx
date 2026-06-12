"use client";

import { useEffect, useId, useState } from "react";

type MermaidDiagramProps = {
  chart: string;
};

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const source = chart.trim();
    if (!source) return;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
        });
        const { svg: rendered } = await mermaid.render(`forge-mmd-${reactId}`, source);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSvg(null);
          setError(err instanceof Error ? err.message : "Diagrama inválido");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <pre
        className="forge-chat-wireframe overflow-x-auto rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)] p-3 text-[11px] leading-snug text-[var(--forge-silver)]"
        data-testid="mermaid-fallback"
      >
        {chart.trim()}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div
        className="forge-mermaid-skeleton h-24 animate-pulse rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)]"
        data-testid="mermaid-loading"
        aria-hidden
      />
    );
  }

  return (
    <div
      className="forge-mermaid my-2 overflow-x-auto rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)] p-3 [&_svg]:max-w-full"
      data-testid="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}