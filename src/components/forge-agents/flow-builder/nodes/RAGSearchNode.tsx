import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function RAGSearchNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode id={id} cardType="configurable" iconContext="canvas" selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("rag_search")} label="RAG Search" subtitle={`top_k: ${config.top_k ?? 5}`} />;
}
