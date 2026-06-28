import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function TransformerNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const tmpl = config.template as string;
  return <BaseNode id={id} cardType="configurable" iconContext="canvas" selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("transformer")} label="Transformer" subtitle={tmpl ? tmpl.slice(0, 30) : "Definir template..."} />;
}
