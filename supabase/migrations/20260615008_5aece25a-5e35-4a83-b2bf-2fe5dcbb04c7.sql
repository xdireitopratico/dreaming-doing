
-- agent_marketplace_listings: Agentes publicados no marketplace
CREATE TABLE public.agent_marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.agent_flows(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  icon_emoji TEXT DEFAULT '🤖',
  flow_snapshot JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT true,
  install_count INTEGER NOT NULL DEFAULT 0,
  avg_rating NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ratings table
CREATE TABLE public.agent_marketplace_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.agent_marketplace_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

-- Indexes
CREATE INDEX idx_marketplace_listings_category ON public.agent_marketplace_listings(category);
CREATE INDEX idx_marketplace_listings_published ON public.agent_marketplace_listings(is_published);
CREATE INDEX idx_marketplace_listings_publisher ON public.agent_marketplace_listings(publisher_id);
CREATE INDEX idx_marketplace_ratings_listing ON public.agent_marketplace_ratings(listing_id);

-- RLS
ALTER TABLE public.agent_marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_marketplace_ratings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can browse published listings
CREATE POLICY "Anyone can view published listings"
  ON public.agent_marketplace_listings FOR SELECT
  TO authenticated
  USING (is_published = true OR publisher_id = auth.uid());

-- Publishers manage their own listings
CREATE POLICY "Publishers manage own listings"
  ON public.agent_marketplace_listings FOR ALL
  TO authenticated
  USING (publisher_id = auth.uid())
  WITH CHECK (publisher_id = auth.uid());

-- Anyone can view ratings
CREATE POLICY "Anyone can view ratings"
  ON public.agent_marketplace_ratings FOR SELECT
  TO authenticated
  USING (true);

-- Users manage own ratings
CREATE POLICY "Users manage own ratings"
  ON public.agent_marketplace_ratings FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
