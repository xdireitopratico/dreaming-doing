ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS taste_lead_email text,
  ADD COLUMN IF NOT EXISTS taste_lead_consent_at timestamptz;

COMMENT ON COLUMN public.profiles.taste_lead_email IS 'E-mail coletado pelo concierge Taste (com consentimento)';