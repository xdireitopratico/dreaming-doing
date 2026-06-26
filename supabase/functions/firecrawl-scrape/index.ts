import { createClient } from "npm:@supabase/supabase-js@2";
import { logIntegrationUsage } from "../_shared/integration-logger.ts";
import { getPlatformSecret } from "../_shared/platform-secrets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLOCKED_HOST_RE =
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|\[?::1\]?|localhost)/i;

function isBlockedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return BLOCKED_HOST_RE.test(u.hostname) || u.protocol === "file:";
  } catch {
    return true;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require valid Supabase JWT
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { url, options } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = await getPlatformSecret(admin, "FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured (platform_secrets or env)");
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    if (isBlockedUrl(formattedUrl)) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL targets a private/internal address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scraping URL:', formattedUrl);

    const startTime = Date.now();
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: options?.formats || ['markdown'],
        onlyMainContent: options?.onlyMainContent ?? true,
        waitFor: options?.waitFor,
        location: options?.location,
      }),
    });
    const latencyMs = Date.now() - startTime;

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      
      // Log failed request
      await logIntegrationUsage({
        provider: "firecrawl",
        serviceType: "search",
        action: "scrape",
        unitsConsumed: 0,
        unitType: "requests",
        latencyMs,
        success: false,
        errorMessage: data.error || `Request failed with status ${response.status}`,
        sourceFunction: "firecrawl-scrape",
        requestMetadata: { 
          url: formattedUrl.substring(0, 100),
          source_feature: "firecrawl-scrape",
          source_function: "firecrawl-scrape"
        }
      });
      
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log successful request
    await logIntegrationUsage({
      provider: "firecrawl",
      serviceType: "search",
      action: "scrape",
      unitsConsumed: 1,
      unitType: "requests",
      latencyMs,
      success: true,
      sourceFunction: "firecrawl-scrape",
      requestMetadata: { 
        url: formattedUrl.substring(0, 100),
        source_feature: "firecrawl-scrape",
        source_function: "firecrawl-scrape"
      }
    });

    console.log('Scrape successful');
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
