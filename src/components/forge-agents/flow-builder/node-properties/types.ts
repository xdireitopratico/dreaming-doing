/** Shared interface for all node config sub-components */
export interface NodeConfigProps {
  config: Record<string, unknown>;
  updateConfig: (key: string, value: unknown) => void;
}
