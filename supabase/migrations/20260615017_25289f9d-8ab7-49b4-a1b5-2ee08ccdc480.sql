
-- Add pricing columns to marketplace listings
ALTER TABLE public.agent_marketplace_listings
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_share_percent integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS is_free boolean GENERATED ALWAYS AS (price_cents = 0) STORED;

-- Track marketplace purchases
CREATE TABLE IF NOT EXISTS public.agent_marketplace_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.agent_marketplace_listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  price_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  seller_amount_cents integer NOT NULL DEFAULT 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.agent_marketplace_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON public.agent_marketplace_purchases FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "Users can insert own purchases"
  ON public.agent_marketplace_purchases FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());
