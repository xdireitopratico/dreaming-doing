import { type NodeProps } from "@xyflow/react";
import { Search } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function RAGSearchNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="rag_search"
      selected={selected}
      icon={<Search className="h-3 w-3" />}
      label="RAG Search"
      subtitle={`top_k: ${config.top_k ?? 5}`}
    />
  );
}
