-- Taste phase counters (concierge chat + one Start Project demo)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS taste_chat_remaining integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS taste_start_remaining integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.profiles.taste_chat_remaining IS 'Mensagens Taste (concierge NVIDIA) antes de exigir BYOK';
COMMENT ON COLUMN public.profiles.taste_start_remaining IS 'Créditos Start Project (agent-run demo ~10–15 min)';

-- Novos usuários: manter trial legado alinhado ao chat Taste
ALTER TABLE public.profiles
  ALTER COLUMN trial_messages_remaining SET DEFAULT 50;