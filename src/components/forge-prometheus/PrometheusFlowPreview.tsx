/**
 * PrometheusFlowPreview — Static React Flow preview of built agent
 */

interface FlowNode {
  id: string;
  type: string;
  label: string;
}

interface FlowEdge {
  source: string;
  target: string;
}

const NODE_ICONS: Record<string, string> = {
  trigger: "⚡",
  llm: "🧠",
  condition: "🔀",
  tool: "🔧",
  output_guard: "🛡️",
  stt: "🎤",
  tts: "🔊",
  rag: "📚",
  default: "⬡",
};

const NODE_COLORS: Record<string, string> = {
  trigger: "hsl(142 70% 45%)",
  llm: "hsl(210 100% 60%)",
  condition: "hsl(45 100% 50%)",
  tool: "hsl(25 100% 50%)",
  output_guard: "hsl(0 70% 50%)",
  stt: "hsl(271 80% 55%)",
  tts: "hsl(271 80% 55%)",
  rag: "hsl(210 80% 50%)",
  default: "hsl(210 30% 50%)",
};

interface Props {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export function PrometheusFlowPreview({ nodes, edges }: Props) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ps-border)" }}>
      <div className="text-[12px] font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--ps-cream-80)" }}>
        🏗️ Arquitetura do Agente
      </div>

      {/* Visual flow as horizontal chain */}
      <div className="flex items-center gap-1 overflow-x-auto py-3 px-2">
        {nodes.map((node, i) => {
          const icon = NODE_ICONS[node.type] || NODE_ICONS.default;
          const color = NODE_COLORS[node.type] || NODE_COLORS.default;

          return (
            <div key={node.id} className="flex items-center">
              <div
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-w-[80px] transition-all"
                style={{
                  // BUG 1 FIX: Use proper HSL alpha syntax instead of string concat
                  background: color.startsWith("hsl") ? color.replace(")", " / 0.1)") : `${color}10`,
                  border: `1px solid ${color.startsWith("hsl") ? color.replace(")", " / 0.3)") : `${color}30`}`,
                }}
              >
                <span className="text-[16px]">{icon}</span>
                <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color }}>
                  {node.label}
                </span>
                <span className="text-[8px]" style={{ color: "var(--ps-cream-25)" }}>
                  {node.type}
                </span>
              </div>
              {i < nodes.length - 1 && (
                <div className="flex items-center mx-1">
                  <div className="w-4 h-px" style={{ background: "var(--ps-accent)" }} />
                  <div className="w-0 h-0" style={{ borderLeft: "4px solid var(--ps-accent)", borderTop: "3px solid transparent", borderBottom: "3px solid transparent" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edge count */}
      <div className="mt-2 text-[10px] text-right" style={{ color: "var(--ps-cream-25)" }}>
        {nodes.length} nós · {edges.length} conexões
      </div>
    </div>
  );
}
