-- Onboarding Wizard: tracking de quem completou o setup
-- TASTE state ends quando onboarding_completed_at é setado
-- (mas BYOK/setup pode ser refeito a qualquer momento)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT NULL;

COMMENT ON COLUMN public.profiles.onboarding_completed_at IS
  'Setado quando o usuário completa o wizard 4-passos. Pós-onboarding, TASTE não se aplica mais.';
COMMENT ON COLUMN public.profiles.onboarding_step IS
  'Último step alcançado no wizard (api_keys, model, sandbox, deploy). Útil pra retomar.';

CREATE INDEX IF NOT EXISTS profiles_onboarding_completed_at_idx
  ON public.profiles(onboarding_completed_at)
  WHERE onboarding_completed_at IS NOT NULL;
