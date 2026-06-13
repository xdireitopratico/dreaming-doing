import { agentPlanFunction } from "./functions/agent-plan";
import { agentBuildFunction } from "./functions/agent-build";
import { gatewayFlowFunction } from "./functions/gateway-flow";

export const inngestFunctions = [agentPlanFunction, agentBuildFunction, gatewayFlowFunction];
