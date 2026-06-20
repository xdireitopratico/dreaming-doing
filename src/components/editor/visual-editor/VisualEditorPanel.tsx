import { useMemo } from "react";
import type {
  PickedElement,
  ComputedStyleMap,
  StyleEdit,
  VisualEditGroup,
  VisualEditorMode,
} from "./types";

interface VisualEditorPanelProps {
  mode: VisualEditorMode;
  selectedElement: PickedElement | null;
  computedStyles: ComputedStyleMap | null;
  activeEditGroup: VisualEditGroup | null;
  editGroups: VisualEditGroup[];
  onUpdateStyle: (property: string, value: string) => void;
  onRemoveEdit: (property: string) => void;
  onRevertAll: () => void;
  onApply: () => void;
  onCancel: () => void;
  onTogglePicking: () => void;
}

const STYLE_CATEGORIES = [
  {
    label: "Cores",
    key: "colors",
    properties: [
      { cssProperty: "background-color", label: "Fundo", type: "color" as const },
      { cssProperty: "color", label: "Texto", type: "color" as const },
      { cssProperty: "border-color", label: "Borda", type: "color" as const },
      { cssProperty: "outline-color", label: "Outline", type: "color" as const },
    ],
  },
  {
    label: "Tipografia",
    key: "typography",
    properties: [
      { cssProperty: "font-size", label: "Tamanho", type: "text" as const, placeholder: "16px" },
      { cssProperty: "font-weight", label: "Peso", type: "text" as const, placeholder: "400" },
      { cssProperty: "font-family", label: "Fonte", type: "text" as const, placeholder: "Inter" },
      { cssProperty: "line-height", label: "Altura linha", type: "text" as const, placeholder: "1.5" },
      { cssProperty: "letter-spacing", label: "Espaçamento", type: "text" as const, placeholder: "0" },
      { cssProperty: "text-align", label: "Alinhamento", type: "select" as const, options: ["left", "center", "right", "justify"] },
      { cssProperty: "text-transform", label: "Transformar", type: "select" as const, options: ["none", "uppercase", "lowercase", "capitalize"] },
    ],
  },
  {
    label: "Espaçamento",
    key: "spacing",
    properties: [
      { cssProperty: "padding", label: "Padding", type: "text" as const, placeholder: "16px" },
      { cssProperty: "margin", label: "Margin", type: "text" as const, placeholder: "0" },
      { cssProperty: "gap", label: "Gap", type: "text" as const, placeholder: "8px" },
    ],
  },
  {
    label: "Layout",
    key: "layout",
    properties: [
      { cssProperty: "display", label: "Display", type: "select" as const, options: ["block", "flex", "grid", "inline-block", "inline", "none"] },
      { cssProperty: "flex-direction", label: "Direção flex", type: "select" as const, options: ["row", "column", "row-reverse", "column-reverse"] },
      { cssProperty: "align-items", label: "Align items", type: "select" as const, options: ["flex-start", "center", "flex-end", "stretch", "baseline"] },
      { cssProperty: "justify-content", label: "Justify", type: "select" as const, options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] },
      { cssProperty: "width", label: "Largura", type: "text" as const, placeholder: "auto" },
      { cssProperty: "max-width", label: "Larg. máxima", type: "text" as const, placeholder: "none" },
    ],
  },
  {
    label: "Borda & Sombra",
    key: "border",
    properties: [
      { cssProperty: "border-radius", label: "Arredondamento", type: "text" as const, placeholder: "0" },
      { cssProperty: "border-width", label: "Grossura borda", type: "text" as const, placeholder: "0" },
      { cssProperty: "border-style", label: "Estilo borda", type: "select" as const, options: ["none", "solid", "dashed", "dotted", "double"] },
      { cssProperty: "box-shadow", label: "Sombra", type: "text" as const, placeholder: "none" },
    ],
  },
];

function PendingEditsBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px]">
      {count}
    </span>
  );
}

export function VisualEditorPanel({
  mode,
  selectedElement,
  computedStyles,
  activeEditGroup,
  editGroups,
  onUpdateStyle,
  onRemoveEdit,
  onRevertAll,
  onApply,
  onCancel,
  onTogglePicking,
}: VisualEditorPanelProps) {
  const totalEdits = useMemo(
    () => editGroups.reduce((acc, g) => acc + g.edits.length, 0),
    [editGroups],
  );

  const editMap = useMemo(() => {
    const map = new Map<string, string>();
    if (activeEditGroup) {
      for (const edit of activeEditGroup.edits) {
        map.set(edit.property, edit.value);
      }
    }
    return map;
  }, [activeEditGroup]);

  if (mode === "inactive") return null;

  return (
    <div className="forge-ve-panel pointer-events-auto flex max-h-full w-[280px] shrink-0 flex-col overflow-hidden border-l border-neutral-200 bg-white text-sm shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-800">Editor Visual</span>
          <PendingEditsBadge count={totalEdits} />
        </div>
        <div className="flex items-center gap-1">
          {mode === "picking" && (
            <button
              type="button"
              onClick={onTogglePicking}
              className="rounded px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
              title="Cancelar seleção"
            >
              Sair
            </button>
          )}
        </div>
      </div>

      {/* Pick mode banner */}
      {mode === "picking" && (
        <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
          <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
          Clique em um elemento no preview para inspecionar
        </div>
      )}

      {/* Editing panel */}
      {mode === "editing" && selectedElement && (
        <>
          {/* Element info */}
          <div className="border-b border-neutral-200 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] text-neutral-700">
                {selectedElement.tagName}
                {selectedElement.id && `#${selectedElement.id}`}
                {selectedElement.classes.length > 0 &&
                  `.${selectedElement.classes.slice(0, 2).join(".")}`}
              </code>
              <span className="text-neutral-300">/</span>
              <span className="truncate max-w-[120px]" title={selectedElement.selector}>
                {selectedElement.selector}
              </span>
            </div>
            {selectedElement.text && (
              <p className="mt-1 truncate text-[11px] text-neutral-400">
                "{selectedElement.text.slice(0, 60)}"
              </p>
            )}
          </div>

          {/* Style categories */}
          <div className="flex-1 overflow-y-auto">
            {STYLE_CATEGORIES.map((category) => {
              const hasEdits = category.properties.some((p) => editMap.has(p.cssProperty));
              return (
                <div key={category.key} className="border-b border-neutral-100">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      {category.label}
                    </span>
                    {hasEdits && (
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                    )}
                  </div>
                  <div className="space-y-1 px-3 pb-2">
                    {category.properties.map((prop) => {
                      const currentValue = editMap.get(prop.cssProperty);
                      const originalValue = computedStyles?.[prop.cssProperty] ?? "";
                      const isEdited = currentValue !== undefined;

                      if (prop.type === "color") {
                        return (
                          <div key={prop.cssProperty} className="flex items-center gap-2">
                            <div className="relative">
                              <input
                                type="color"
                                value={(currentValue ?? originalValue) || "#000000"}
                                onChange={(e) => onUpdateStyle(prop.cssProperty, e.target.value)}
                                className="size-6 cursor-pointer rounded border border-neutral-300 p-0.5"
                                title={prop.label}
                              />
                              {isEdited && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveEdit(prop.cssProperty)}
                                  className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full border border-neutral-300 bg-white text-[8px] text-neutral-400 hover:text-red-500"
                                  title="Remover edição"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            <span className="flex-1 truncate text-[11px] text-neutral-600">
                              {prop.label}
                            </span>
                            <span className="max-w-[80px] truncate text-[10px] text-neutral-400 font-mono">
                              {currentValue ?? originalValue}
                            </span>
                          </div>
                        );
                      }

                      if (prop.type === "select") {
                        return (
                          <div key={prop.cssProperty} className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-[11px] text-neutral-600">
                              {prop.label}
                            </span>
                            <select
                              value={(currentValue ?? originalValue) || ""}
                              onChange={(e) => onUpdateStyle(prop.cssProperty, e.target.value)}
                              className="flex-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-700"
                            >
                              <option value="">—</option>
                              {prop.options?.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                            {isEdited && (
                              <button
                                type="button"
                                onClick={() => onRemoveEdit(prop.cssProperty)}
                                className="text-[10px] text-neutral-400 hover:text-red-500"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div key={prop.cssProperty} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-[11px] text-neutral-600">
                            {prop.label}
                          </span>
                          <input
                            type="text"
                            value={(currentValue ?? originalValue) || ""}
                            onChange={(e) => onUpdateStyle(prop.cssProperty, e.target.value)}
                            placeholder={prop.placeholder}
                            className={`flex-1 rounded border px-1.5 py-0.5 text-[11px] font-mono text-neutral-700 ${
                              isEdited
                                ? "border-emerald-300 bg-emerald-50"
                                : "border-neutral-300 bg-white"
                            }`}
                          />
                          {isEdited && (
                            <button
                              type="button"
                              onClick={() => onRemoveEdit(prop.cssProperty)}
                              className="text-[10px] text-neutral-400 hover:text-red-500"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending edits summary */}
          {totalEdits > 0 && (
            <div className="border-t border-neutral-200 px-3 py-2">
              <p className="text-[10px] font-medium text-neutral-500">
                {totalEdits} ediç{totalEdits === 1 ? "ão" : "ões"} pendente
                {totalEdits !== 1 && "s"} em {editGroups.length} elemento
                {editGroups.length !== 1 && "s"}
              </p>
              <div className="mt-1 max-h-[80px] overflow-y-auto space-y-0.5">
                {editGroups.map((group) =>
                  group.edits.map((edit) => (
                    <div
                      key={`${group.selector}-${edit.property}`}
                      className="flex items-center justify-between text-[10px] text-neutral-500"
                    >
                      <code className="truncate font-mono">{edit.property}</code>
                      <span className="truncate text-neutral-400">
                        {edit.originalValue} → {edit.value}
                      </span>
                    </div>
                  )),
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 border-t border-neutral-200 px-3 py-2.5">
            <button
              type="button"
              onClick={onApply}
              disabled={totalEdits === 0}
              className="flex-1 rounded-md bg-neutral-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {totalEdits > 0
                ? `Aplicar ${totalEdits} ediç${totalEdits === 1 ? "ão" : "ões"}`
                : "Nenhuma edição"}
            </button>
            {totalEdits > 0 && (
              <button
                type="button"
                onClick={onRevertAll}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Reverter
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100"
            >
              Fechar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
