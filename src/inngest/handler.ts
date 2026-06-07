import { serve } from "inngest/edge";
import { inngest } from "./client";
import { inngestFunctions } from "./index";

const serveOrigin =
  process.env.VERCEL_URL != null
    ? `https://${process.env.VERCEL_URL}`
    : "https://dreaming-doing.vercel.app";

export const inngestHandler = serve({
  client: inngest,
  functions: inngestFunctions,
  servePath: "/api/inngest",
  serveOrigin,
});

export { inngest, inngestFunctions };
