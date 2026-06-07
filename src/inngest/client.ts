import { eventType, Inngest, staticSchema } from "inngest";
import type { AgentRunRequest } from "./functions/_shared";

type PlanRequestedData = AgentRunRequest;

const planRequestedEvent = eventType("agent/plan.requested", {
  schema: staticSchema<PlanRequestedData>(),
});

const buildRequestedEvent = eventType("agent/build.requested", {
  schema: staticSchema<PlanRequestedData>(),
});

export const inngest = new Inngest({
  id: "dreaming-doing",
  isDev: process.env.NODE_ENV !== "production",
});

export const events = {
  planRequested: planRequestedEvent,
  buildRequested: buildRequestedEvent,
} as const;
