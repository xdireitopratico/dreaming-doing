/**
 * aetherforge-marketplace-checkout — Creates Stripe checkout for marketplace purchases
 * R52: Marketplace Monetizado
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { createMarketplaceCheckout } from "../_shared/marketplace-billing.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get user from JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { listing_id, success_url, cancel_url } = await req.json();

    if (!listing_id) {
      return new Response(JSON.stringify({ error: "listing_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch listing
    const { data: listing, error: listErr } = await supabase
      .from("agent_marketplace_listings")
      .select("id, name, price_cents, revenue_share_percent, publisher_id, is_published")
      .eq("id", listing_id)
      .single();

    if (listErr || !listing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!listing.is_published) {
      return new Response(JSON.stringify({ error: "Listing not available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (listing.price_cents <= 0) {
      return new Response(JSON.stringify({ error: "This listing is free, install directly" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (listing.publisher_id === user.id) {
      return new Response(JSON.stringify({ error: "Cannot buy your own listing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already purchased
    const { data: existing } = await supabase
      .from("agent_marketplace_purchases")
      .select("id")
      .eq("listing_id", listing_id)
      .eq("buyer_id", user.id)
      .eq("status", "completed")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Already purchased" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // BUG 65 FIX: Use env var instead of hardcoded domain
    const siteUrl = Deno.env.get("SITE_URL") || "https://vibrant-visionary-craft1.lovable.app";

    const result = await createMarketplaceCheckout(
      {
        listingId: listing.id,
        listingName: listing.name,
        priceCents: listing.price_cents,
        revenueSharePercent: listing.revenue_share_percent,
        buyerId: user.id,
        sellerId: listing.publisher_id,
        successUrl: success_url || `${siteUrl}/admin/agent-builder`,
        cancelUrl: cancel_url || `${siteUrl}/admin/agent-builder`,
      },
      supabase,
    );

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[marketplace-checkout] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
