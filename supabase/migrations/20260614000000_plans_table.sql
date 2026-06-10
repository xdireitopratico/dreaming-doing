-- Migration: plans table — entidade persistente para planos propostos/approvados.
-- Substitui o meta.plan do agent_runs (que expirava em 5 min).
-- Plans persistem indefinidamente com status e timeout de 24h.

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'expired')),
  mission TEXT,
  summary TEXT,
  objective TEXT,
  rationale TEXT,
  assumptions JSONB DEFAULT '[]'::jsonb,
  out_of_scope JSONB DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  phases JSONB DEFAULT '[]'::jsonb,
  markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_plans_run_id ON plans(run_id);
CREATE INDEX idx_plans_project_id ON plans(project_id);
CREATE INDEX idx_plans_status ON plans(status);
