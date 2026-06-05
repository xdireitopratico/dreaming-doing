// useElementPicker.ts — Click no preview da aplicação captura seletor CSS
// Ativa o "pick mode" onde cada click no iframe retorna o seletor do elemento
import { useCallback, useEffect, useRef, useState } from "react";

interface PickedElement {
  selector: string;
  tagName: string;
  id: string | null;
  classes: string[];
  boundingBox: { x: number; y: number; w: number; h: number };
  text: string | null;
}

interface UseElementPickerOptions {
  /** Ref to the preview iframe */
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** Called when user picks an element */
  onPick: (element: PickedElement) => void;
  /** Whether pick mode is active */
  active: boolean;
  /** Callback to toggle pick mode */
  onToggle: () => void;
}

export function useElementPicker({ iframeRef, onPick, active, onToggle }: UseElementPickerOptions) {
  const [isPicking, setIsPicking] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const buildSelector = useCallback((el: Element): string => {
    const parts: string[] = [];
    let current: Element | null = el;

    while (current && current !== document.body && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part = `#${current.id}`;
        parts.unshift(part);
        break;
      }
      if (current.className && typeof current.className === "string") {
        const cls = current.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (cls) part = `${part}.${cls}`;
      }
      parts.unshift(part);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }, []);

  const getComputedInfo = useCallback((el: Element): PickedElement => {
    const rect = el.getBoundingClientRect();
    return {
      selector: buildSelector(el),
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: el.className ? String(el.className).trim().split(/\s+/) : [],
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      text: el.textContent?.trim().slice(0, 100) ?? null,
    };
  }, [buildSelector]);

  // Inject pick script into iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !active) return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Add overlay
      const overlay = doc.createElement("div");
      overlay.id = "forge-picker-overlay";
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 999999;
        pointer-events: none;
      `;
      doc.body.appendChild(overlay);

      // Highlight element
      const highlight = doc.createElement("div");
      highlight.id = "forge-picker-highlight";
      highlight.style.cssText = `
        position: fixed; z-index: 999998; pointer-events: none;
        border: 2px solid var(--forge-primary, #6ee7b7);
        background: rgba(110,231,183,0.08);
        border-radius: 4px;
        transition: all 80ms ease-out;
        display: none;
      `;
      doc.body.appendChild(highlight);

      // Tag label
      const label = doc.createElement("div");
      label.id = "forge-picker-label";
      label.style.cssText = `
        position: fixed; z-index: 999999; pointer-events: none;
        background: var(--forge-primary, #6ee7b7);
        color: #0a0408; font-family: monospace; font-size: 10px;
        padding: 2px 6px; border-radius: 3px;
        white-space: nowrap; display: none;
      `;
      doc.body.appendChild(label);

      const updateHighlight = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();
        highlight.style.display = "block";
        highlight.style.top = `${rect.top}px`;
        highlight.style.left = `${rect.left}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;

        label.style.display = "block";
        label.style.top = `${Math.max(rect.top - 24, 0)}px`;
        label.style.left = `${rect.left}px`;
        label.textContent = buildSelector(el);
      };

      const onMouseMove = (e: MouseEvent) => {
        const el = doc.elementFromPoint(e.clientX, e.clientY);
        if (el && el !== doc.body && el !== doc.documentElement) {
          updateHighlight(el);
        }
      };

      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const el = doc.elementFromPoint(e.clientX, e.clientY);
        if (el && el !== doc.body && el !== doc.documentElement) {
          onPick(getComputedInfo(el));
          onToggle();
        }
      };

      doc.addEventListener("mousemove", onMouseMove, true);
      doc.addEventListener("click", onClick, true);

      // Cursor style
      doc.body.style.cursor = "crosshair";

      return () => {
        doc.removeEventListener("mousemove", onMouseMove, true);
        doc.removeEventListener("click", onClick, true);
        doc.body.style.cursor = "";
        overlay.remove();
        highlight.remove();
        label.remove();
      };
    } catch {
      // Cross-origin iframe — ignore
    }
  }, [iframeRef, active, onPick, onToggle, buildSelector, getComputedInfo]);

  return { isPicking: active, onToggle };
}
