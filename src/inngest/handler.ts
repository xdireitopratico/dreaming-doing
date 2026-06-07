import { serve } from "inngest/edge";
import { inngest } from "./client";
import { inngestFunctions } from "./index";

// Stable production URL — VERCEL_URL is per-deployment and breaks Inngest sync/invoke.
const serveOrigin =
  process.env.INNGEST_SERVE_ORIGIN ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://dreaming-doing.vercel.app");

export const inngestHandler = serve({
  client: inngest,
  functions: inngestFunctions,
  servePath: "/api/inngest",
  serveOrigin,
});

export { inngest, inngestFunctions };
