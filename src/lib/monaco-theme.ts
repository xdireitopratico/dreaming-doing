// monaco-theme.ts — Tema Monaco customizado com tokens do design system FORGE
// Cada cor é minuciosamente escolhida pra máxima legibilidade e beleza
import type { editor } from "monaco-editor";

/** Mesmo cinza do painel Explorer (pastas) — evita diff/code em preto puro. */
export const FORGE_EDITOR_SURFACE = "#1a1c22";

export const FORGE_THEME: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: false,
  colors: {
    // Background layers
    "editor.background": FORGE_EDITOR_SURFACE,
    "editor.foreground": "#EDEFF2",
    "editor.lineHighlightBackground": "#22252d",
    "editor.selectionBackground": "rgba(255, 182, 39, 0.18)",
    "editor.inactiveSelectionBackground": "rgba(255, 182, 39, 0.08)",
    "editorCursor.foreground": "#FFB627",
    "editorWhitespace.foreground": "rgba(237, 239, 242, 0.12)",

    // Line numbers (ghost subtle)
    "editorLineNumber.foreground": "rgba(237, 239, 242, 0.22)",
    "editorLineNumber.activeForeground": "rgba(237, 239, 242, 0.55)",

    // Minimap
    "minimap.background": FORGE_EDITOR_SURFACE,
    "minimap.selectionHighlight": "rgba(255, 182, 39, 0.25)",

    // Bracket matching
    "editorBracketMatch.background": "rgba(255, 182, 39, 0.12)",
    "editorBracketMatch.border": "rgba(255, 182, 39, 0.30)",

    // Find / replace highlights
    "editor.findMatchBackground": "rgba(255, 122, 26, 0.35)",
    "editor.findMatchHighlightBackground": "rgba(255, 122, 26, 0.18)",

    // Gutter
    "editorGutter.background": FORGE_EDITOR_SURFACE,
    "editorGutter.addedBackground": "rgba(91, 214, 166, 0.18)",
    "editorGutter.modifiedBackground": "rgba(255, 182, 39, 0.18)",
    "editorGutter.deletedBackground": "rgba(229, 72, 77, 0.18)",

    // Ruler and guides
    "editorRuler.foreground": "rgba(237, 239, 242, 0.06)",
    "editorIndentGuide.background": "rgba(237, 239, 242, 0.06)",
    "editorIndentGuide.activeBackground": "rgba(237, 239, 242, 0.14)",

    // Scrollbar
    "scrollbar.shadow": FORGE_EDITOR_SURFACE,
    "scrollbarSlider.background": "rgba(237, 239, 242, 0.08)",
    "scrollbarSlider.hoverBackground": "rgba(237, 239, 242, 0.14)",
    "scrollbarSlider.activeBackground": "rgba(237, 239, 242, 0.20)",

    // Widgets (suggest, parameter hints)
    "editorWidget.background": "#22252d",
    "editorWidget.border": "rgba(237, 239, 242, 0.08)",
    "editorSuggestWidget.background": "#22252d",
    "editorSuggestWidget.border": "rgba(237, 239, 242, 0.08)",
    "editorSuggestWidget.selectedBackground": "rgba(255, 182, 39, 0.12)",
    "editorHoverWidget.background": "#22252d",
    "editorHoverWidget.border": "rgba(237, 239, 242, 0.08)",

    // Error and warning
    "editorError.foreground": "#E5484D",
    "editorWarning.foreground": "#FFB627",
    "editorInfo.foreground": "#9FB4C7",

    // Diff editor — fundo cinza do explorer; vermelho/verde só nas mudanças
    "diffEditor.insertedTextBackground": "rgba(91, 214, 166, 0.18)",
    "diffEditor.removedTextBackground": "rgba(229, 72, 77, 0.18)",
    "diffEditor.insertedTextBorder": "rgba(91, 214, 166, 0.35)",
    "diffEditor.removedTextBorder": "rgba(229, 72, 77, 0.35)",
    "diffEditor.insertedLineBackground": "rgba(91, 214, 166, 0.08)",
    "diffEditor.removedLineBackground": "rgba(229, 72, 77, 0.08)",
    "diffEditor.insertedTextForeground": "#5BD6A6",
    "diffEditor.removedTextForeground": "#E5484D",
    "diffEditor.unchangedRegionBackground": FORGE_EDITOR_SURFACE,
    "diffEditor.unchangedRegionForeground": "#C9CED6",
    "diffEditor.unchangedCodeBackground": FORGE_EDITOR_SURFACE,
    "diffEditor.border": "rgba(237, 239, 242, 0.08)",
    "diffEditor.diagonalFill": "rgba(237, 239, 242, 0.04)",
  },
  rules: [
    // ─── Keywords ─── (cold blue metallic — técnico, calmo)
    {
      token: "keyword",
      foreground: "#9FB4C7",
    },
    {
      token: "keyword.control",
      foreground: "#9FB4C7",
      fontStyle: "normal",
    },
    { token: "keyword.operator", foreground: "#C9CED6" },

    // ─── Strings ─── (success green — satisfatório, legível)
    { token: "string", foreground: "#5BD6A6" },
    { token: "string.quoted", foreground: "#5BD6A6" },
    { token: "string.template", foreground: "#5BD6A6" },

    // ─── Numbers ─── (amber primary — dados quentes)
    { token: "number", foreground: "#FFB627" },
    { token: "number.hex", foreground: "#FFB627" },
    { token: "number.float", foreground: "#FFB627" },

    // ─── Comments ─── (fundo, não atrapalha)
    { token: "comment", foreground: "#4A4E56", fontStyle: "italic" },
    { token: "comment.line", foreground: "#4A4E56", fontStyle: "italic" },
    { token: "comment.block", foreground: "#4A4E56", fontStyle: "italic" },
    { token: "comment.documentation", foreground: "#535861", fontStyle: "italic" },

    // ─── Types & Classes ─── (laranja hot — distinto, importante)
    { token: "type", foreground: "#FF7A1A" },
    { token: "type.identifier", foreground: "#FF7A1A" },
    { token: "type.class", foreground: "#FF7A1A" },
    { token: "type.interface", foreground: "#FF7A1A" },
    { token: "type.enum", foreground: "#FF7A1A" },
    { token: "type.parameter", foreground: "#EDEFF2" },

    // ─── Functions ─── (silver — limpo, legível)
    { token: "entity.name.function", foreground: "#C9CED6" },
    { token: "entity.name.method", foreground: "#C9CED6" },
    { token: "support.function", foreground: "#C9CED6" },
    { token: "entity.name.function.macro", foreground: "#C9CED6" },

    // ─── Variables ─── (foreground padrão)
    { token: "variable", foreground: "#EDEFF2" },
    { token: "variable.parameter", foreground: "#C2C5CA" },
    { token: "variable.member", foreground: "#C9CED6" },
    { token: "variable.other", foreground: "#EDEFF2" },

    // ─── Properties / Attributes ───
    { token: "variable.other.property", foreground: "#C9CED6" },
    { token: "entity.other.attribute-name", foreground: "#FFB627" },

    // ─── Tags (HTML/JSX) ───
    { token: "tag", foreground: "#FF7A1A" },
    { token: "metatag", foreground: "#FF7A1A" },
    { token: "entity.name.tag", foreground: "#FF7A1A" },
    { token: "entity.other.attribute-name.html", foreground: "#FFB627" },
    { token: "entity.other.attribute-name.tsx", foreground: "#FFB627" },
    { token: "entity.other.attribute-name.jsx", foreground: "#FFB627" },

    // ─── Constants ───
    { token: "constant", foreground: "#FFB627" },
    { token: "constant.character.escape", foreground: "#FF7A1A" },
    { token: "constant.language", foreground: "#9FB4C7" },

    // ─── Regex ───
    { token: "string.regexp", foreground: "#FF7A1A" },

    // ─── Decorators / Annotations ───
    { token: "tag.decorator", foreground: "#FFB627" },

    // ─── Punctuation ───
    { token: "delimiter", foreground: "#5C6169" },
    { token: "delimiter.bracket", foreground: "#656A72" },
    { token: "delimiter.parenthesis", foreground: "#5C6169" },

    // ─── Emphasis ───
    { token: "emphasis", fontStyle: "italic" },
    { token: "strong", fontStyle: "bold" },
  ],
};

export function registerForgeTheme(monaco: any): void {
  monaco.editor.defineTheme("forge", FORGE_THEME);
}
