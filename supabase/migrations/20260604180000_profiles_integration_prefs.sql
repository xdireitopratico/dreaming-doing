-- Preferências de integração (FORGE vs próprio) e tira-gosto por usuário

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS integration_prefs jsonb NOT NULL DEFAULT '{
    "github": "forge",
    "supabase": "forge",
    "vercel": "forge",
    "cloudflare": "own",
    "e2b": "forge"
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS trial_messages_remaining integer NOT NULL DEFAULT 8;

COMMENT ON COLUMN public.profiles.integration_prefs IS 'Modo por conector: forge (infra FORGE) ou own (conta do usuário)';
COMMENT ON COLUMN public.profiles.trial_messages_remaining IS 'Mensagens restantes no tira-gosto antes de exigir BYOK';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    avatar_url,
    integration_prefs,
    trial_messages_remaining
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data ->> 'avatar_url',
    '{
      "github": "forge",
      "supabase": "forge",
      "vercel": "forge",
      "cloudflare": "own",
      "e2b": "forge"
    }'::jsonb,
    8
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;