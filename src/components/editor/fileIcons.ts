// fileIcons.ts — Mapeamento de extensão → cor + ícone
// Cores alinhadas com tokens do design system FORGE
export interface FileIcon {
  label: string;
  color: string;
  colorHex: string;
}

const iconMap: Record<string, FileIcon> = {
  ts: { label: "TS", color: "var(--cold)", colorHex: "#9FB4C7" },
  tsx: { label: "TSX", color: "var(--cold)", colorHex: "#9FB4C7" },
  js: { label: "JS", color: "var(--primary)", colorHex: "#FFB627" },
  jsx: { label: "JSX", color: "var(--primary)", colorHex: "#FFB627" },
  css: { label: "CSS", color: "var(--success)", colorHex: "#5BD6A6" },
  scss: { label: "SCSS", color: "var(--success)", colorHex: "#5BD6A6" },
  less: { label: "LESS", color: "var(--success)", colorHex: "#5BD6A6" },
  html: { label: "HTML", color: "var(--primary-hot)", colorHex: "#FF7A1A" },
  htm: { label: "HTM", color: "var(--primary-hot)", colorHex: "#FF7A1A" },
  json: { label: "{}", color: "var(--primary)", colorHex: "#FFB627" },
  jsonc: { label: "{}", color: "var(--primary)", colorHex: "#FFB627" },
  yaml: { label: "YML", color: "var(--primary-hot)", colorHex: "#FF7A1A" },
  yml: { label: "YML", color: "var(--primary-hot)", colorHex: "#FF7A1A" },
  md: { label: "MD", color: "var(--silver)", colorHex: "#C9CED6" },
  mdx: { label: "MDX", color: "var(--silver)", colorHex: "#C9CED6" },
  svg: { label: "SVG", color: "var(--primary-hot)", colorHex: "#FF7A1A" },
  png: { label: "IMG", color: "var(--silver)", colorHex: "#C9CED6" },
  jpg: { label: "IMG", color: "var(--silver)", colorHex: "#C9CED6" },
  jpeg: { label: "IMG", color: "var(--silver)", colorHex: "#C9CED6" },
  gif: { label: "IMG", color: "var(--silver)", colorHex: "#C9CED6" },
  ico: { label: "ICO", color: "var(--silver)", colorHex: "#C9CED6" },
  env: { label: "ENV", color: "var(--success)", colorHex: "#5BD6A6" },
  gitignore: { label: "GIT", color: "var(--primary-hot)", colorHex: "#FF7A1A" },
  lock: { label: "LCK", color: "var(--silver)", colorHex: "#C9CED6" },
  toml: { label: "TOML", color: "var(--cold)", colorHex: "#9FB4C7" },
  sql: { label: "SQL", color: "var(--cold)", colorHex: "#9FB4C7" },
  graphql: { label: "GQL", color: "var(--primary)", colorHex: "#FFB627" },
  prisma: { label: "PRS", color: "var(--cold)", colorHex: "#9FB4C7" },
  wasm: { label: "WASM", color: "var(--cold)", colorHex: "#9FB4C7" },
};

export function getFileIcon(path: string): FileIcon {
  const filename = path.split("/").pop() ?? "";
  if (filename === "package.json" || filename === "package-lock.json") {
    return { label: "PKG", color: "var(--primary)", colorHex: "#FFB627" };
  }
  if (filename === "tsconfig.json" || filename === "tsconfig.node.json") {
    return { label: "TS", color: "var(--cold)", colorHex: "#9FB4C7" };
  }
  if (filename === "dockerfile" || filename === "Dockerfile") {
    return { label: "DKR", color: "var(--cold)", colorHex: "#9FB4C7" };
  }
  if (filename === "docker-compose.yml" || filename === "docker-compose.yaml") {
    return { label: "DKR", color: "var(--cold)", colorHex: "#9FB4C7" };
  }
  if (filename === ".gitignore" || filename === ".prettierrc" || filename === ".eslintrc" || filename === ".eslintrc.json") {
    return { label: "CFG", color: "var(--silver)", colorHex: "#C9CED6" };
  }
  if (filename === "README.md" || filename === "readme.md") {
    return { label: "📖", color: "var(--silver)", colorHex: "#C9CED6" };
  }

  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() ?? "" : "";
  return iconMap[ext] ?? { label: "·", color: "var(--text-ghost)", colorHex: "rgba(237,239,242,0.22)" };
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    css: "css", scss: "scss", less: "less", html: "html", htm: "html",
    json: "json", jsonc: "jsonc", yaml: "yaml", yml: "yaml",
    md: "markdown", mdx: "markdown", svg: "xml",
    toml: "ini", env: "plaintext", sql: "sql",
    graphql: "graphql", prisma: "prisma",
    sh: "shell", bash: "shell", zsh: "shell",
    py: "python", rs: "rust", go: "go", java: "java",
    rb: "ruby", php: "php", c: "c", cpp: "cpp", h: "c",
    wasm: "plaintext",
  };
  return langMap[ext] ?? "plaintext";
}
