/**
 * xyflow-react-shim
 *
 * Camada de compatibilidade apenas para tipos compartilhados.
 * Runtime deve importar diretamente de `@xyflow/react` para evitar
 * contratos ambíguos no bundle.
 */
export type {
  BackgroundVariant,
  Connection,
  Edge,
  EdgeProps,
  Node,
  NodeProps,
  OnEdgesChange,
  OnNodesChange,
} from "@xyflow/react";
