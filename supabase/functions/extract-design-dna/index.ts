import { createClient } from "npm:@supabase/supabase-js@2";
import { type ExtractionCategory } from "./prompts.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractInput {
  urls: string[];
  depth: "shallow" | "deep";
  categories?: ExtractionCategory[];
  userId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const input: ExtractInput = await req.json();
    if (!input.urls?.length || input.urls.length > 5) {
      return new Response(JSON.stringify({ error: "1-5 URLs required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const depth = input.depth ?? "shallow";
    const categories = input.categories ?? [
      "hero",
      "motion",
      "typography",
      "color_application",
      "components",
      "interactions",
    ];

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const response = await fetch(`${supabaseUrl}/functions/v1/design-dna-scheduler`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "schedule",
        urls: input.urls,
        depth,
        categories,
        userId: input.userId ?? null,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      return new Response(
        JSON.stringify({
          error: `Failed to queue design-dna job: HTTP ${response.status} — ${errText.slice(0, 200)}`,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const schedulerData = await response.json();
    return new Response(
      JSON.stringify({
        result: {
          queued: true,
          async: true,
          note: "Design DNA extraction foi enfileirada e continuará em background.",
          ...schedulerData,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
