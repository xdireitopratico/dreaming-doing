export interface PickedElement {
  selector: string;
  tagName: string;
  id: string | null;
  classes: string[];
  boundingBox: { x: number; y: number; w: number; h: number };
  text: string | null;
}

export interface ComputedStyleMap {
  [property: string]: string;
}

export interface StyleEdit {
  property: string;
  value: string;
  originalValue: string;
}

export interface VisualEditGroup {
  selector: string;
  edits: StyleEdit[];
}

export type VisualEditorMode = "inactive" | "picking" | "editing";

export interface VisualEditorState {
  mode: VisualEditorMode;
  selectedElement: PickedElement | null;
  computedStyles: ComputedStyleMap | null;
  editGroups: VisualEditGroup[];
}

export interface EditableStyleCategory {
  label: string;
  key: string;
  properties: Array<{
    cssProperty: string;
    label: string;
    type: "color" | "text" | "number" | "select";
    options?: string[];
    placeholder?: string;
  }>;
}
