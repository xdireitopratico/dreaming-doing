/**
 * PrometheusCostSummary — Cost and config summary panel
 */

interface Props {
  costPerInteraction: number;
  nodesCount: number;
  channels: string[];
  qualityScore: number;
}

const CHANNEL_LABELS: Record<string, string> = {
  web_widget: "🌐 Web Widget",
  whatsapp: "📱 WhatsApp",
  telegram: "✈️ Telegram",
  api_rest: "🔗 API REST",
};

export function PrometheusCostSummary({ costPerInteraction, nodesCount, channels, qualityScore }: Props) {
  return (
    <div className="rounded-xl p-4 h-full" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ps-border)" }}>
      <div className="text-[12px] font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--ps-cream-80)" }}>
        📊 Resumo
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--ps-cream-40)" }}>Custo/interação</span>
          <span className="text-[13px] font-bold ps-mono" style={{ color: "hsl(142 70% 45%)" }}>
            ~${costPerInteraction.toFixed(3)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--ps-cream-40)" }}>Nós criados</span>
          <span className="text-[12px] font-semibold" style={{ color: "var(--ps-cream-80)" }}>{nodesCount}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--ps-cream-40)" }}>Qualidade</span>
          <span className="text-[12px] font-semibold" style={{
            color: qualityScore >= 8 ? "hsl(142 70% 45%)" : qualityScore >= 6 ? "hsl(45 100% 50%)" : "hsl(0 70% 50%)",
          }}>
            {qualityScore}/10
          </span>
        </div>

        <div className="h-px" style={{ background: "var(--ps-border)" }} />

        <div>
          <div className="text-[10px] mb-1.5" style={{ color: "var(--ps-cream-40)" }}>Canais</div>
          <div className="flex flex-wrap gap-1">
            {channels.map(ch => (
              <span key={ch} className="text-[9px] px-1.5 py-0.5 rounded" style={{
                background: "rgba(59,130,246,0.08)",
                color: "var(--ps-accent)",
                border: "1px solid rgba(59,130,246,0.15)",
              }}>
                {CHANNEL_LABELS[ch] || ch}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
