import { agentPlanFunction } from "./functions/agent-plan";
import { agentBuildFunction } from "./functions/agent-build";
import { agentChatFunction } from "./functions/agent-chat";
import { gatewayFlowFunction } from "./functions/gateway-flow";
import { designDnaExtractFunction } from "./functions/design-dna-extract";

export const inngestFunctions = [
  agentPlanFunction,
  agentBuildFunction,
  agentChatFunction,
  gatewayFlowFunction,
  designDnaExtractFunction,
];
