
-- B5: Create codex_genomes table for agent templates
CREATE TABLE public.codex_genomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    genome_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    domain TEXT NOT NULL DEFAULT 'geral',
    complexity TEXT NOT NULL DEFAULT 'medium',
    template_nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    template_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_models JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags TEXT[] DEFAULT '{}',
    estimated_cost_per_interaction NUMERIC DEFAULT 0.001,
    estimated_latency_ms INT DEFAULT 2000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.codex_genomes ENABLE ROW LEVEL SECURITY;

-- Public read for all authenticated users
CREATE POLICY "Authenticated users can read genomes"
ON public.codex_genomes FOR SELECT TO authenticated
USING (true);

CREATE INDEX idx_codex_genomes_domain ON public.codex_genomes(domain);
CREATE INDEX idx_codex_genomes_active ON public.codex_genomes(is_active);
