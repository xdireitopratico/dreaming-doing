import { serve } from "inngest/edge";
import { inngest } from "./client";
import { inngestFunctions } from "./index";

export const inngestHandler = serve({
  client: inngest,
  functions: inngestFunctions,
});

export { inngest, inngestFunctions };
