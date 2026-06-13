/**
 * marketplace-billing.ts — Stripe checkout for marketplace purchases
 * ADR-023: Billing logic isolated from gateway and marketplace UI
 * Max 150 lines (anti-monolithic)
 */

import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

interface CreateMarketplaceCheckoutParams {
  listingId: string;
  listingName: string;
  priceCents: number;
  revenueSharePercent: number; // seller gets this %
  buyerId: string;
  sellerId: string;
  successUrl: string;
  cancelUrl: string;
}

interface CheckoutResult {
  success: boolean;
  url?: string;
  sessionId?: string;
  error?: string;
}

export async function createMarketplaceCheckout(
  params: CreateMarketplaceCheckoutParams,
  supabaseClient: any
): Promise<CheckoutResult> {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return { success: false, error: "STRIPE_SECRET_KEY not configured" };
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" });

  const sellerAmountCents = Math.round(params.priceCents * params.revenueSharePercent / 100);
  const platformFeeCents = params.priceCents - sellerAmountCents;

  // Record purchase as pending
  const { data: purchase, error: insertErr } = await supabaseClient
    .from("agent_marketplace_purchases")
    .insert({
      listing_id: params.listingId,
      buyer_id: params.buyerId,
      seller_id: params.sellerId,
      price_cents: params.priceCents,
      platform_fee_cents: platformFeeCents,
      seller_amount_cents: sellerAmountCents,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    return { success: false, error: `DB insert failed: ${insertErr.message}` };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "brl",
            unit_amount: params.priceCents,
            product_data: {
              name: `Agent: ${params.listingName}`,
              description: "AetherForge Marketplace — Agente de IA",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "marketplace_purchase",
        purchase_id: purchase.id,
        listing_id: params.listingId,
        buyer_id: params.buyerId,
        seller_id: params.sellerId,
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    // Update purchase with stripe session
    await supabaseClient
      .from("agent_marketplace_purchases")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", purchase.id);

    return { success: true, url: session.url!, sessionId: session.id };
  } catch (err: any) {
    // Mark purchase as failed
    await supabaseClient
      .from("agent_marketplace_purchases")
      .update({ status: "failed" })
      .eq("id", purchase.id);

    return { success: false, error: err.message };
  }
}

/**
 * Handle webhook confirmation for marketplace purchases
 */
export async function completeMarketplacePurchase(
  purchaseId: string,
  paymentIntentId: string,
  supabaseClient: any
): Promise<boolean> {
  const { error } = await supabaseClient
    .from("agent_marketplace_purchases")
    .update({
      status: "completed",
      stripe_payment_intent_id: paymentIntentId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", purchaseId)
    .eq("status", "pending");

  if (error) {
    console.error("[marketplace-billing] Complete failed:", error);
    return false;
  }

  // Increment install_count on the listing
  const { data: purchase } = await supabaseClient
    .from("agent_marketplace_purchases")
    .select("listing_id")
    .eq("id", purchaseId)
    .single();

  if (purchase) {
    await supabaseClient.rpc("increment_counter", {
      table_name: "agent_marketplace_listings",
      column_name: "install_count",
      row_id: purchase.listing_id,
    }).catch(() => {
      // Fallback: manual increment
      supabaseClient
        .from("agent_marketplace_listings")
        .select("install_count")
        .eq("id", purchase.listing_id)
        .single()
        .then(({ data }: any) => {
          if (data) {
            supabaseClient
              .from("agent_marketplace_listings")
              .update({ install_count: (data.install_count || 0) + 1 })
              .eq("id", purchase.listing_id);
          }
        });
    });
  }

  return true;
}
