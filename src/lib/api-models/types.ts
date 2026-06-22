import type { AiProviderId } from "@/lib/ai-provider-registry";
import type { PoolSlotPublic } from "@/lib/save-connector";

export type ProviderUiState = {
  id: AiProviderId;
  status: "available" | "connected";
  keyValue: string;
  baseUrl: string;
  poolCount: number;
  poolSlots: PoolSlotPublic[];
};