import { Code2, Eye } from "lucide-react";

export type EditorMainView = "preview" | "code";

interface EditorViewTabsProps {
  active: EditorMainView;
  onChange: (view: EditorMainView) => void;
}

export function EditorViewTabs({ active, onChange }: EditorViewTabsProps) {
  return (
    <div className="editor-view-tabs" role="tablist" aria-label="Visualização do projeto">
      <button
        type="button"
        role="tab"
        aria-selected={active === "preview"}
        data-active={active === "preview"}
        className="editor-view-tab"
        onClick={() => onChange("preview")}
      >
        <span className="editor-view-tab-dot size-1.5 rounded-full bg-[var(--text-ghost)]" />
        <Eye className="size-3.5" />
        Preview
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "code"}
        data-active={active === "code"}
        className="editor-view-tab"
        onClick={() => onChange("code")}
      >
        <span className="editor-view-tab-dot size-1.5 rounded-full bg-[var(--text-ghost)]" />
        <Code2 className="size-3.5" />
        Code
      </button>
    </div>
  );
}