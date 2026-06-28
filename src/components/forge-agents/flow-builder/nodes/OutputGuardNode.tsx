import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

const RULE_LABELS: Record<string, string> = {
  pii_mask: "PII", legal_disclaimer: "Legal", no_guarantee: "NoGar",
  max_length: "MaxLen", toxicity: "Tox", confidentiality: "Conf",
  regex_filter: "Regex", keyword_blacklist: "Block",
};

export function OutputGuardNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const guardConfig = config.guard_config || {};
  const rules: any[] = guardConfig.rules || config.rules || [];
  const enabledRules = Array.isArray(rules)
    ? (typeof rules[0] === "string" ? (rules as string[]).map(r => ({ id: r, enabled: true })) : rules.filter(r => r.enabled))
    : [];
  return (
    <BaseNode id={id} cardType="configuration" iconContext="configuration" selected={selected} icon={getNodeIconSource("output_guard")} label="Output Guard" status={resolveNodeStatus(data)}
      subtitle={`${enabledRules.length} regra(s) ativa(s)`}>
      {enabledRules.length > 0 && (
        <div className="absolute top-full mt-7 left-1/2 -translate-x-1/2 w-40 flex flex-wrap justify-center gap-0.5">
          {enabledRules.slice(0, 4).map((r) => (
            <span key={r.id} className="text-[8px] px-1 py-0.5 rounded font-medium" style={{ background: 'var(--ps-bg-surface-hover, rgba(255,255,255,0.05))', color: 'var(--ps-cream-80, rgba(240,230,215,0.8))' }}>
              {RULE_LABELS[r.id] || r.id}
            </span>
          ))}
          {enabledRules.length > 4 && <span className="text-[8px]" style={{ color: 'var(--ps-cream-40)' }}>+{enabledRules.length - 4}</span>}
        </div>
      )}
    </BaseNode>
  );
}
