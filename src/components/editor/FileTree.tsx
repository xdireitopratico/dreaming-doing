// FileTree.tsx — Árvore de arquivos com nesting, ícones por tipo, criar/renomear/deletar
// Animações stagger cascade, nesting visual com linhas guia, context menu
import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, Folder, FolderOpen, FilePlus, FolderPlus,
  MoreVertical, Pencil, Trash2, Copy, GripVertical,
} from "lucide-react";
import { getFileIcon } from "./fileIcons";
import { cn } from "@/lib/utils";

export interface TreeNode {
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
}

interface FileTreeProps {
  files: string[];
  activePath: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
}

// Converte array plano de paths em árvore aninhada
function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  const sorted = [...paths].sort();

  for (const path of sorted) {
    const parts = path.split("/");
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1 && part.includes(".");
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!map.has(currentPath)) {
        const node: TreeNode = {
          path: currentPath,
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : [],
        };
        map.set(currentPath, node);

        if (i === 0) {
          root.push(node);
        } else {
          const parentPath = parts.slice(0, i).join("/");
          const parent = map.get(parentPath);
          if (parent?.children) {
            parent.children.push(node);
          }
        }
      }

      // Se encontramos uma pasta mas depois vemos que é arquivo
      const existing = map.get(currentPath)!;
      if (isFile) {
        existing.type = "file";
        existing.children = undefined;
      }
    }
  }

  return root;
}

export function FileTree({
  files,
  activePath,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [contextTarget, setContextTarget] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleContext = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setContextTarget(path);
    setContextPos({ x: e.clientX, y: e.clientY });
  };

  const closeContext = () => setContextTarget(null);

  const startRename = () => {
    if (!contextTarget) return;
    setEditing(contextTarget);
    setEditValue(contextTarget.split("/").pop() ?? "");
    closeContext();
  };

  const commitRename = () => {
    if (editing && editValue.trim()) {
      const parentDir = editing.includes("/")
        ? editing.split("/").slice(0, -1).join("/") + "/"
        : "";
      onRename(editing, parentDir + editValue.trim());
    }
    setEditing(null);
  };

  const renderNode = (node: TreeNode, depth: number, index: number) => {
    const isCollapsed = collapsed.has(node.path);
    const isActive = node.path === activePath;
    const isEditing = node.path === editing;
    const icon = node.type === "folder" ? null : getFileIcon(node.path);
    const name = node.path.split("/").pop() ?? node.path;

    return (
      <motion.div
        key={node.path}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.015, duration: 0.25, ease: "easeOut" }}
      >
        <div
          className={cn(
            "group flex items-center h-7 px-1.5 mx-1 rounded cursor-pointer transition-colors select-none",
            "hover:bg-[var(--surface-2)]",
            isActive && "bg-[var(--primary)]/10 border border-[var(--primary)]/20",
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => {
            if (node.type === "folder") {
              toggleCollapse(node.path);
            } else {
              onSelectFile(node.path);
            }
          }}
          onContextMenu={(e) => handleContext(e, node.path)}
        >
          {/* Nesting guide lines */}
          {depth > 0 && (
            <div
              className="absolute left-0 w-px h-7"
              style={{
                left: `${depth * 16 - 6}px`,
                background: "var(--border)",
              }}
            />
          )}

          {/* Collapse chevron or file icon */}
          {node.type === "folder" ? (
            <motion.span
              animate={{ rotate: isCollapsed ? 0 : 90 }}
              transition={{ duration: 0.15 }}
              className="mr-1 text-[var(--text-ghost)]"
            >
              <ChevronRight className="size-3.5" />
            </motion.span>
          ) : (
            <span
              className="mr-1.5 font-mono text-[9px] tracking-wider w-4 text-center shrink-0"
              style={{ color: icon?.color ?? "var(--text-ghost)" }}
            >
              {icon?.label ?? "·"}
            </span>
          )}

          {/* Folder icon or nothing (file icon already shown) */}
          {node.type === "folder" && (
            <span className="mr-1.5 text-[var(--text-dim)]">
              {isCollapsed ? (
                <Folder className="size-3.5" />
              ) : (
                <FolderOpen className="size-3.5" />
              )}
            </span>
          )}

          {/* Name (edit mode or display) */}
          {isEditing ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditing(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-[var(--surface-2)] border border-[var(--primary)]/50 rounded px-1 py-0 text-[11px] font-mono text-[var(--foreground)] outline-none min-w-0"
            />
          ) : (
            <span
              className={cn(
                "text-[12px] font-mono truncate",
                isActive
                  ? "text-[var(--foreground)]"
                  : "text-[var(--text-dim)] group-hover:text-[var(--foreground)]",
              )}
            >
              {name}
            </span>
          )}

          {/* Hover actions (file + folder) */}
          <div className="ml-auto hidden group-hover:flex items-center gap-0.5">
            {node.type === "folder" && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateFile(node.path); }}
                  className="p-0.5 rounded hover:bg-[var(--border)] transition-colors"
                  title="Novo arquivo"
                >
                  <FilePlus className="size-3 text-[var(--text-dim)] hover:text-[var(--foreground)]" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateFolder(node.path); }}
                  className="p-0.5 rounded hover:bg-[var(--border)] transition-colors"
                  title="Nova pasta"
                >
                  <FolderPlus className="size-3 text-[var(--text-dim)] hover:text-[var(--foreground)]" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Children */}
        <AnimatePresence>
          {node.type === "folder" && !isCollapsed && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              {node.children.map((child, i) => renderNode(child, depth + 1, i))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[var(--surface-1)]/60 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-[var(--border)] shrink-0">
        <span className="font-mono text-[9px] tracking-[0.3em] uppercase text-[var(--text-ghost)]">
          EXPLORER
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onCreateFile("")}
            className="p-1 rounded hover:bg-[var(--border)] transition-colors"
            title="Novo arquivo"
          >
            <FilePlus className="size-3.5 text-[var(--text-dim)] hover:text-[var(--foreground)]" />
          </button>
          <button
            onClick={() => onCreateFolder("")}
            className="p-1 rounded hover:bg-[var(--border)] transition-colors"
            title="Nova pasta"
          >
            <FolderPlus className="size-3.5 text-[var(--text-dim)] hover:text-[var(--foreground)]" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-ghost)]">
            <Folder className="size-8 opacity-30" />
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase">VAZIO</span>
          </div>
        ) : (
          tree.map((node, i) => renderNode(node, 0, i))
        )}
      </div>

      {/* Context Menu (positioned absolutely on viewport) */}
      <AnimatePresence>
        {contextTarget && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeContext} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="fixed z-50 min-w-[140px] bg-[var(--surface-1)] border border-[var(--border)] rounded-lg shadow-xl backdrop-blur-xl py-1 overflow-hidden"
              style={{ left: contextPos.x, top: contextPos.y }}
            >
              <button
                onClick={startRename}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-[var(--text-dim)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors text-left"
              >
                <Pencil className="size-3" /> Renomear
              </button>
              <button
                onClick={() => {
                  if (contextTarget) {
                    onDelete(contextTarget);
                  }
                  closeContext();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors text-left"
              >
                <Trash2 className="size-3" /> Deletar
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
