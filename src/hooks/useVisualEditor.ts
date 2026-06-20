import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PickedElement,
  ComputedStyleMap,
  StyleEdit,
  VisualEditGroup,
  VisualEditorMode,
} from "@/components/editor/visual-editor/types";

const EDITABLE_PROPERTIES = [
  "background-color",
  "color",
  "font-size",
  "font-weight",
  "font-family",
  "text-align",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-radius",
  "border-width",
  "border-color",
  "border-style",
  "box-shadow",
  "width",
  "height",
  "max-width",
  "max-height",
  "min-width",
  "min-height",
  "gap",
  "display",
  "flex-direction",
  "align-items",
  "justify-content",
  "opacity",
  "line-height",
  "letter-spacing",
  "text-transform",
  "overflow",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "transform",
  "transition",
  "cursor",
  "outline",
  "outline-color",
  "outline-width",
  "outline-style",
  "backdrop-filter",
  "background",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "border",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
];

interface UseVisualEditorOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onApply: (groups: VisualEditGroup[]) => void;
}

export function useVisualEditor({ iframeRef, onApply }: UseVisualEditorOptions) {
  const [mode, setMode] = useState<VisualEditorMode>("inactive");
  const [selectedElement, setSelectedElement] = useState<PickedElement | null>(null);
  const [computedStyles, setComputedStyles] = useState<ComputedStyleMap | null>(null);
  const [editGroups, setEditGroups] = useState<VisualEditGroup[]>([]);
  const [activeEditGroup, setActiveEditGroup] = useState<VisualEditGroup | null>(null);

  const highlightRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const lastHoveredEl = useRef<Element | null>(null);

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

  const getPickedElement = useCallback(
    (el: Element): PickedElement => {
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
    },
    [buildSelector],
  );

  const getIframeWindow = useCallback((): Window | null => {
    return iframeRef.current?.contentWindow ?? null;
  }, [iframeRef]);

  const getComputedStylesMap = useCallback((el: Element): ComputedStyleMap => {
    const iw = getIframeWindow();
    if (!iw) return {};
    const cs = iw.getComputedStyle(el);
    const map: ComputedStyleMap = {};
    for (const prop of EDITABLE_PROPERTIES) {
      const val = cs.getPropertyValue(prop);
      if (val && val !== "none" && val !== "normal" && !val.startsWith("rgba(0, 0, 0, 0)")) {
        map[prop] = val;
      }
    }
    return map;
  }, [getIframeWindow]);

  const applyStyleToIframeElement = useCallback(
    (editGroup: VisualEditGroup) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const el = doc.querySelector(editGroup.selector);
        if (!el) return;
        for (const edit of editGroup.edits) {
          (el as HTMLElement).style.setProperty(edit.property, edit.value);
        }
      } catch {
        // cross-origin
      }
    },
    [iframeRef],
  );

  const commitEditGroup = useCallback(
    (selector: string, edits: StyleEdit[]) => {
      const existingIdx = editGroups.findIndex((g) => g.selector === selector);
      const group: VisualEditGroup = { selector, edits };
      if (existingIdx >= 0) {
        setEditGroups((prev) => {
          const next = [...prev];
          next[existingIdx] = group;
          return next;
        });
      } else {
        setEditGroups((prev) => [...prev, group]);
      }
      setActiveEditGroup(group);
      applyStyleToIframeElement(group);
    },
    [editGroups, applyStyleToIframeElement],
  );

  const updateStyleEdit = useCallback(
    (property: string, value: string) => {
      if (!activeEditGroup || !selectedElement) return;
      const originalValue = computedStyles?.[property] ?? "";
      const existingIdx = activeEditGroup.edits.findIndex((e) => e.property === property);
      let newEdits: StyleEdit[];
      if (existingIdx >= 0) {
        newEdits = activeEditGroup.edits.map((e, i) =>
          i === existingIdx ? { ...e, value } : e,
        );
      } else {
        newEdits = [
          ...activeEditGroup.edits,
          { property, value, originalValue },
        ];
      }
      commitEditGroup(selectedElement.selector, newEdits);
    },
    [activeEditGroup, selectedElement, computedStyles, commitEditGroup],
  );

  const removeStyleEdit = useCallback(
    (property: string) => {
      if (!activeEditGroup || !selectedElement) return;
      const newEdits = activeEditGroup.edits.filter((e) => e.property !== property);
      commitEditGroup(selectedElement.selector, newEdits);
    },
    [activeEditGroup, selectedElement, commitEditGroup],
  );

  const revertAllEdits = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      for (const group of editGroups) {
        const el = doc.querySelector(group.selector);
        if (!el) continue;
        for (const edit of group.edits) {
          (el as HTMLElement).style.removeProperty(edit.property);
        }
      }
    } catch {
      // cross-origin
    }
    setEditGroups([]);
    setActiveEditGroup(null);
  }, [iframeRef, editGroups]);

  const handleApply = useCallback(() => {
    if (editGroups.length > 0) {
      onApply(editGroups);
    }
    revertAllEdits();
    setMode("inactive");
    setSelectedElement(null);
    setComputedStyles(null);
  }, [editGroups, onApply, revertAllEdits]);

  const handleCancel = useCallback(() => {
    revertAllEdits();
    setMode("inactive");
    setSelectedElement(null);
    setComputedStyles(null);
  }, [revertAllEdits]);

  const handlePickElement = useCallback(
    (el: Element) => {
      const picked = getPickedElement(el);
      const styles = getComputedStylesMap(el);
      setSelectedElement(picked);
      setComputedStyles(styles);
      setMode("editing");
      const existing = editGroups.find((g) => g.selector === picked.selector);
      if (existing) {
        setActiveEditGroup(existing);
      } else {
        const group: VisualEditGroup = { selector: picked.selector, edits: [] };
        setEditGroups((prev) => [...prev, group]);
        setActiveEditGroup(group);
      }
    },
    [getPickedElement, getComputedStylesMap, editGroups],
  );

  const updateHighlight = useCallback((el: Element) => {
    const rect = el.getBoundingClientRect();
    if (highlightRef.current) {
      highlightRef.current.style.display = "block";
      highlightRef.current.style.top = `${rect.top}px`;
      highlightRef.current.style.left = `${rect.left}px`;
      highlightRef.current.style.width = `${rect.width}px`;
      highlightRef.current.style.height = `${rect.height}px`;
    }
    if (labelRef.current) {
      labelRef.current.style.display = "block";
      labelRef.current.style.top = `${Math.max(rect.top - 24, 0)}px`;
      labelRef.current.style.left = `${rect.left}px`;
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || mode === "inactive") return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      const overlay = doc.createElement("div");
      overlay.id = "forge-ve-overlay";
      overlay.style.cssText =
        "position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;pointer-events:none;";
      doc.body.appendChild(overlay);
      overlayRef.current = overlay;

      const highlight = doc.createElement("div");
      highlight.id = "forge-ve-highlight";
      highlight.style.cssText =
        "position:fixed;z-index:999998;pointer-events:none;border:2px solid #6ee7b7;background:rgba(110,231,183,0.08);border-radius:4px;transition:all 80ms ease-out;display:none;";
      doc.body.appendChild(highlight);
      highlightRef.current = highlight;

      const label = doc.createElement("div");
      label.id = "forge-ve-label";
      label.style.cssText =
        "position:fixed;z-index:999999;pointer-events:none;background:#6ee7b7;color:#0a0408;font-family:monospace;font-size:10px;padding:2px 6px;border-radius:3px;white-space:nowrap;display:none;";
      doc.body.appendChild(label);

      if (mode === "picking") {
        label.textContent = "Clique para inspecionar";
        label.style.display = "block";
        label.style.top = "8px";
        label.style.left = "8px";
        labelRef.current = label;

        const onMouseMove = (e: MouseEvent) => {
          const el = doc.elementFromPoint(e.clientX, e.clientY);
          if (el && el !== doc.body && el !== doc.documentElement) {
            if (el !== lastHoveredEl.current) {
              lastHoveredEl.current = el;
              const rect = el.getBoundingClientRect();
              updateHighlight(el);
              label.textContent = buildSelector(el);
            }
          }
        };

        const onClick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const el = doc.elementFromPoint(e.clientX, e.clientY);
          if (el && el !== doc.body && el !== doc.documentElement) {
            handlePickElement(el);
          }
        };

        doc.addEventListener("mousemove", onMouseMove, true);
        doc.addEventListener("click", onClick, true);
        doc.body.style.cursor = "crosshair";

        return () => {
          doc.removeEventListener("mousemove", onMouseMove, true);
          doc.removeEventListener("click", onClick, true);
          doc.body.style.cursor = "";
          overlay.remove();
          highlight.remove();
          label.remove();
          highlightRef.current = null;
          labelRef.current = null;
          overlayRef.current = null;
          lastHoveredEl.current = null;
        };
      }

      if (mode === "editing") {
        return () => {
          overlay.remove();
          highlight.remove();
          label.remove();
          highlightRef.current = null;
          labelRef.current = null;
          overlayRef.current = null;
        };
      }
    } catch {
      // cross-origin iframe
    }
  }, [iframeRef, mode, buildSelector, handlePickElement, updateHighlight]);

  const togglePicking = useCallback(() => {
    if (mode === "inactive") {
      setMode("picking");
    } else {
      handleCancel();
    }
  }, [mode, handleCancel]);

  return {
    mode,
    selectedElement,
    computedStyles,
    editGroups,
    activeEditGroup,
    togglePicking,
    updateStyleEdit,
    removeStyleEdit,
    revertAllEdits,
    handleApply,
    handleCancel,
    setSelectedElement,
    setComputedStyles,
    setEditGroups,
    setActiveEditGroup,
  };
}
