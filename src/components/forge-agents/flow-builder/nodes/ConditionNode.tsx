import { Handle, Position, type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function ConditionNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode id={id} cardType="configuration" iconContext="configuration" selected={selected} icon={getNodeIconSource("condition")} label="Condição" status={resolveNodeStatus(data)}
      subtitle={config.expression ? "✓ configurada" : "Definir..."} showSource={false}>
      <div className="absolute top-full mt-7 left-1/2 -translate-x-1/2 w-20 flex justify-between text-[9px]">
        <span className="text-emerald-500 font-medium">✓ true</span>
        <span className="text-red-500 font-medium">✗ false</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-[#1a1a2e] !left-[30%]" style={{ bottom: "-28px" }} />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-500 !w-3 !h-3 !border-2 !border-[#1a1a2e] !left-[70%]" style={{ bottom: "-28px" }} />
    </BaseNode>
  );
}
