/**
 * FlowCanvasContext — Contexto compartilhado entre canvas, nós e arestas
 *
 * Resolve o problema de comunicação edge→canvas sem props diretas
 * (ReactFlow edge components não recebem callbacks customizadas).
 */
import { createContext, useContext, type ReactNode } from "react";

interface CanvasContextValue {
  /** Open the node creator at a specific position (for edge "Add node between") */
  openNodeCreator?: (position: { x: number; y: number }, insertBetween?: { sourceId: string; targetId: string }) => void;
  /** Delete an edge by ID */
  deleteEdge?: (edgeId: string) => void;
}

const FlowCanvasContext = createContext<CanvasContextValue>({});

export function useFlowCanvas(): CanvasContextValue {
  return useContext(FlowCanvasContext);
}

interface FlowCanvasProviderProps {
  value: CanvasContextValue;
  children: ReactNode;
}

export function FlowCanvasProvider({ value, children }: FlowCanvasProviderProps) {
  return (
    <FlowCanvasContext.Provider value={value}>
      {children}
    </FlowCanvasContext.Provider>
  );
}
