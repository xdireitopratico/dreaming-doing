/**
 * ExecutionDataViewer — View execution data in JSON / Table / Text formats
 * n8n-inspired RunData viewer with expandable JSON tree and format switching.
 *
 * Reusable across TestPanel, ExecutionLogPanel, and future NDV panels.
 */
import { useState, memo, useCallback, type FC } from "react";
import { Copy, Check, Code, Table2, FileText, ChevronRight, ChevronDown } from "lucide-react";

type ViewMode = "json" | "table" | "text";

interface ExecutionDataViewerProps {
  data: unknown;
  defaultView?: ViewMode;
  maxHeight?: string;
  compact?: boolean;
  label?: string;
}

export const ExecutionDataViewer: FC<ExecutionDataViewerProps> = memo(function ExecutionDataViewer({
  data, defaultView = "json", maxHeight = "240px", compact = false, label,
}) {
  const [view, setView] = useState<ViewMode>(defaultView);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(str).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [data]);

  if (data === null || data === undefined) {
    return (
      <div className="text-[10px] italic" style={{ color: "var(--ps-cream-25)" }}>
        Sem dados
      </div>
    );
  }

  const isString = typeof data === "string";
  const isArray = Array.isArray(data);
  const isObject = !isString && !isArray && typeof data === "object" && data !== null;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        {label && (
          <span className="text-[10px] font-medium" style={{ color: "var(--ps-cream-40)" }}>
            {label}
          </span>
        )}
        <div className="flex items-center gap-1">
          {/* View mode switcher — only for non-string data */}
          {!isString && (
            <div className="flex items-center rounded overflow-hidden" style={{ border: "1px solid var(--ps-border, #2a2d35)" }}>
              <button
                onClick={() => setView("json")}
                className="p-0.5 transition-colors"
                style={{
                  background: view === "json" ? "var(--ps-accent, #f59e0b)" : "transparent",
                  color: view === "json" ? "#000" : "var(--ps-cream-40)",
                }}
                title="JSON tree"
              >
                <Code className="h-3 w-3" />
              </button>
              {isArray && (
                <button
                  onClick={() => setView("table")}
                  className="p-0.5 transition-colors"
                  style={{
                    background: view === "table" ? "var(--ps-accent, #f59e0b)" : "transparent",
                    color: view === "table" ? "#000" : "var(--ps-cream-40)",
                  }}
                  title="Table"
                >
                  <Table2 className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => setView("text")}
                className="p-0.5 transition-colors"
                style={{
                  background: view === "text" ? "var(--ps-accent, #f59e0b)" : "transparent",
                  color: view === "text" ? "#000" : "var(--ps-cream-40)",
                }}
                title="Raw JSON"
              >
                <FileText className="h-3 w-3" />
              </button>
            </div>
          )}
          <button
            onClick={handleCopy}
            className="p-0.5 rounded transition-colors hover:bg-white/5"
            style={{ color: copied ? "var(--ps-green, #22c55e)" : "var(--ps-cream-40)" }}
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="rounded overflow-auto font-mono"
        style={{
          maxHeight,
          background: "var(--ps-bg-deep, #0b0d12)",
          border: "1px solid var(--ps-border, #2a2d35)",
          padding: compact ? 6 : 8,
        }}
      >
        {isString ? (
          <TextViewer text={data as string} maxHeight={maxHeight} />
        ) : view === "json" ? (
          <JsonTree value={data} />
        ) : view === "table" && isArray ? (
          <ArrayTable data={data as unknown[]} />
        ) : (
          <RawJson value={data} />
        )}
      </div>
    </div>
  );
});

/* ── JSON recursive tree ── */
function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>null</span>;
  }
  if (typeof value === "string") {
    return <span className="text-[10px]" style={{ color: "var(--ps-green, #22c55e)" }}>"{truncate(value, 200)}"</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-[10px]" style={{ color: "var(--ps-blue, #3b82f6)" }}>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return <JsonArray arr={value} depth={depth} />;
  }
  if (typeof value === "object") {
    return <JsonObject obj={value as Record<string, unknown>} depth={depth} />;
  }
  return <span className="text-[10px]">{String(value)}</span>;
}

function JsonObject({ obj, depth }: { obj: Record<string, unknown>; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth > 3);
  const entries = Object.entries(obj);
  if (entries.length === 0) return <span className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>{`{}`}</span>;

  return (
    <div className="leading-snug">
      <button onClick={() => setCollapsed(!collapsed)} className="inline-flex items-center gap-0.5 hover:opacity-70">
        {collapsed ? <ChevronRight className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        <span className="text-[10px]" style={{ color: "var(--ps-cream-60)" }}>
          {`{${collapsed ? ` ${entries.length} keys ` : ""}`}
        </span>
      </button>
      {!collapsed && (
        <div className="pl-3 border-l" style={{ borderColor: "var(--ps-border, #2a2d35)" }}>
          {entries.map(([key, val]) => (
            <div key={key} className="flex gap-1">
              <span className="text-[10px] shrink-0" style={{ color: "var(--ps-cream-80)" }}>{key}:</span>
              <JsonTree value={val} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
      {!collapsed && <span className="text-[10px]" style={{ color: "var(--ps-cream-60)" }}>{`}`}</span>}
    </div>
  );
}

function JsonArray({ arr, depth }: { arr: unknown[]; depth: number }) {
  const [collapsed, setCollapsed] = useState(depth > 3);
  if (arr.length === 0) return <span className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>{`[]`}</span>;

  return (
    <div className="leading-snug">
      <button onClick={() => setCollapsed(!collapsed)} className="inline-flex items-center gap-0.5 hover:opacity-70">
        {collapsed ? <ChevronRight className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        <span className="text-[10px]" style={{ color: "var(--ps-cream-60)" }}>
          {`[${collapsed ? ` ${arr.length} items ` : ""}`}
        </span>
      </button>
      {!collapsed && (
        <div className="pl-3 border-l" style={{ borderColor: "var(--ps-border, #2a2d35)" }}>
          {arr.map((item, i) => (
            <div key={i} className="flex gap-1">
              <span className="text-[10px] shrink-0" style={{ color: "var(--ps-cream-25)" }}>{i}:</span>
              <JsonTree value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
      {!collapsed && <span className="text-[10px]" style={{ color: "var(--ps-cream-60)" }}>{`]`}</span>}
    </div>
  );
}

/* ── Raw JSON viewer ── */
function RawJson({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <pre className="text-[10px] whitespace-pre-wrap break-all m-0" style={{ color: "var(--ps-cream-60)" }}>
      {text.length > 2000 ? text.slice(0, 2000) + "\n… (truncado)" : text}
    </pre>
  );
}

/* ── Text viewer ── */
function TextViewer({ text, maxHeight }: { text: string; maxHeight: string }) {
  const lines = text.split("\n");
  return (
    <pre className="text-[10px] whitespace-pre-wrap break-all m-0" style={{ color: "var(--ps-cream-60)" }}>
      {text.length > 2000 ? text.slice(0, 2000) + "\n… (truncado)" : text}
    </pre>
  );
}

/* ── Table view for arrays ── */
function ArrayTable({ data }: { data: unknown[] }) {
  if (data.length === 0) {
    return <div className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>Array vazio</div>;
  }

  // Extract columns from first object item
  const firstItem = data.find((item) => typeof item === "object" && item !== null) as Record<string, unknown> | null;
  if (!firstItem) {
    // Array of primitives — show as list
    return (
      <div className="space-y-0.5">
        {data.slice(0, 50).map((item, i) => (
          <div key={i} className="text-[10px] flex gap-2">
            <span style={{ color: "var(--ps-cream-25)" }}>[{i}]</span>
            <JsonTree value={item} />
          </div>
        ))}
        {data.length > 50 && (
          <div className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>
            … +{data.length - 50} more items
          </div>
        )}
      </div>
    );
  }

  const columns = Object.keys(firstItem);
  const rows = data.slice(0, 100);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--ps-border, #2a2d35)" }}>
            <th className="text-left px-1 py-0.5 font-medium" style={{ color: "var(--ps-cream-40)" }}>#</th>
            {columns.map((col) => (
              <th key={col} className="text-left px-1 py-0.5 font-medium" style={{ color: "var(--ps-cream-40)" }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const r = row as Record<string, unknown>;
            return (
              <tr key={i} className="even:bg-white/5" style={{ borderBottom: "1px solid var(--ps-border, #2a2d35)" }}>
                <td className="px-1 py-0.5" style={{ color: "var(--ps-cream-25)" }}>{i}</td>
                {columns.map((col) => (
                  <td key={col} className="px-1 py-0.5 max-w-[200px] truncate">
                    <JsonTree value={r[col]} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.length > 100 && (
        <div className="text-[10px] pt-1" style={{ color: "var(--ps-cream-25)" }}>
          Mostrando 100 de {data.length} itens
        </div>
      )}
    </div>
  );
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}
