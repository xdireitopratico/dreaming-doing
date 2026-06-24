import { eventType, Inngest, staticSchema } from "inngest";
import type { AgentRunRequest } from "./functions/_shared";
import type { DesignDnaJobRequest } from "./functions/_shared-design-dna";

type PlanRequestedData = AgentRunRequest;

const planRequestedEvent = eventType("agent/plan.requested", {
  schema: staticSchema<PlanRequestedData>(),
});

const buildRequestedEvent = eventType("agent/build.requested", {
  schema: staticSchema<PlanRequestedData>(),
});

const chatRequestedEvent = eventType("agent/chat.requested", {
  schema: staticSchema<PlanRequestedData>(),
});

const designDnaExtractRequestedEvent = eventType("design-dna/extract.requested", {
  schema: staticSchema<DesignDnaJobRequest>(),
});

export const inngest = new Inngest({
  id: "dreaming-doing",
  isDev: process.env.NODE_ENV !== "production",
});

export const events = {
  planRequested: planRequestedEvent,
  buildRequested: buildRequestedEvent,
  chatRequested: chatRequestedEvent,
  designDnaExtractRequested: designDnaExtractRequestedEvent,
} as const;
