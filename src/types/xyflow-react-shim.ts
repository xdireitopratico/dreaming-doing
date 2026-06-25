import type { CSSProperties, ComponentType, ReactNode } from "react";
import {
  ReactFlow as XYReactFlow,
  ReactFlowProvider as XYReactFlowProvider,
  Background as XYBackground,
  Controls as XYControls,
  MiniMap as XYMiniMap,
  Panel as XYPanel,
  Handle as XYHandle,
  useReactFlow as xyUseReactFlow,
  useNodesState as xyUseNodesState,
  useEdgesState as xyUseEdgesState,
  addEdge as xyAddEdge,
  applyNodeChanges as xyApplyNodeChanges,
  applyEdgeChanges as xyApplyEdgeChanges,
} from "@xyflow/react";

export type Node<Data = Record<string, unknown>, Type extends string = string> = {
  id: string;
  type?: Type;
  data: Data;
  position?: { x: number; y: number };
  selected?: boolean;
  dragging?: boolean;
  positionAbsolute?: { x: number; y: number };
  width?: number;
  height?: number;
  parentId?: string;
  extent?: "parent" | [[number, number], [number, number]];
  draggable?: boolean;
  selectable?: boolean;
  deletable?: boolean;
  className?: string;
  style?: CSSProperties;
};

export type Edge<Data = Record<string, unknown>, Type extends string = string> = {
  id: string;
  source: string;
  target: string;
  type?: Type;
  data?: Data;
  label?: ReactNode;
  selected?: boolean;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
  markerEnd?: unknown;
};

export type Connection = {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
};

export type OnNodesChange = (changes: unknown[]) => void;
export type OnEdgesChange = (changes: unknown[]) => void;
export type NodeProps<Data = Record<string, unknown>> = {
  id: string;
  data: Data;
  selected: boolean;
  dragging: boolean;
  type?: string;
};
export type EdgeProps<Data = Record<string, unknown>> = {
  id: string;
  data: Data;
  selected: boolean;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
  sourcePosition?: Position;
  targetPosition?: Position;
  markerEnd?: unknown;
};

export type NodeChange = unknown;
export type EdgeChange = unknown;
export type NodeTypes = Record<string, ComponentType<any>>;
export type EdgeTypes = Record<string, ComponentType<any>>;

export type Position = "top" | "right" | "bottom" | "left";

export const Position = {
  Top: "top",
  Right: "right",
  Bottom: "bottom",
  Left: "left",
} as const;

export const ReactFlow = XYReactFlow as unknown as ComponentType<any>;
export const ReactFlowProvider = XYReactFlowProvider as unknown as ComponentType<{ children?: ReactNode }>;
export const Background = XYBackground as unknown as ComponentType<any>;
export const Controls = XYControls as unknown as ComponentType<any>;
export const MiniMap = XYMiniMap as unknown as ComponentType<any>;
export const Panel = XYPanel as unknown as ComponentType<any>;
export const Handle = XYHandle as unknown as ComponentType<any>;
export const BaseEdge = ((props: {
  id?: string;
  path?: string;
  markerEnd?: unknown;
  style?: CSSProperties;
}) => {
  void props;
  return null;
}) as unknown as ComponentType<any>;
export const EdgeLabelRenderer = (({ children }: { children?: ReactNode }) => children ?? null) as unknown as ComponentType<{ children?: ReactNode }>;

export function getBezierPath(_args: any): [string, number, number] {
  const sourceX = Number(_args?.sourceX ?? 0);
  const sourceY = Number(_args?.sourceY ?? 0);
  const targetX = Number(_args?.targetX ?? 0);
  const targetY = Number(_args?.targetY ?? 0);
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const path = `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;
  return [path, midX, midY];
}

export function useReactFlow<TNode extends Node = Node, TEdge extends Edge = Edge>(): {
  fitView: (options?: { duration?: number }) => void;
  getNodes: () => TNode[];
  getEdges: () => TEdge[];
  setNodes: (nodes: TNode[] | ((nodes: TNode[]) => TNode[])) => void;
  setEdges: (edges: TEdge[] | ((edges: TEdge[]) => TEdge[])) => void;
  project: (position: { x: number; y: number }) => { x: number; y: number };
} {
  return xyUseReactFlow() as any;
}

export function useNodesState<TNode extends Node = Node>(
  initialNodes: TNode[] = [],
): [TNode[], (value: TNode[] | ((nodes: TNode[]) => TNode[])) => void, OnNodesChange] {
  return xyUseNodesState(initialNodes as any) as any;
}

export function useEdgesState<TEdge extends Edge = Edge>(
  initialEdges: TEdge[] = [],
): [TEdge[], (value: TEdge[] | ((edges: TEdge[]) => TEdge[])) => void, OnEdgesChange] {
  return xyUseEdgesState(initialEdges as any) as any;
}

export function addEdge<TEdge extends Edge = Edge>(
  edge: Partial<TEdge> & { source: string | null | undefined; target: string | null | undefined },
  edges: TEdge[],
): TEdge[] {
  return xyAddEdge(edge as any, edges as any) as TEdge[];
}

export function applyNodeChanges<TNode extends Node>(changes: unknown[], nodes: TNode[]): TNode[] {
  return xyApplyNodeChanges(changes as any, nodes as any) as TNode[];
}

export function applyEdgeChanges<TEdge extends Edge>(changes: unknown[], edges: TEdge[]): TEdge[] {
  return xyApplyEdgeChanges(changes as any, edges as any) as TEdge[];
}

export const MarkerType = {
  Arrow: "arrow",
  ArrowClosed: "arrowclosed",
} as const;

export const ConnectionMode = {
  Strict: "strict",
  Loose: "loose",
} as const;

export const ConnectionLineType = {
  Bezier: "bezier",
  Straight: "straight",
  Step: "step",
  SmoothStep: "smoothstep",
} as const;
