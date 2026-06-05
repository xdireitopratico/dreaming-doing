-- Supabase conector: só conta do usuário; defaults sem modo FORGE implícito

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'connector_kind' AND e.enumlabel = 'supabase'
  ) THEN
    ALTER TYPE public.connector_kind ADD VALUE 'supabase';
  END IF;
END $$;

-- Novos usuários: tudo "own" (usuário configura)
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
      "github": "own",
      "supabase": "own",
      "vercel": "own",
      "netlify": "own",
      "cloudflare": "own",
      "e2b": "own"
    }'::jsonb,
    8
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Perfis existentes: não tratar Supabase como FORGE conectado na UI
UPDATE public.profiles
SET integration_prefs = integration_prefs || '{"supabase":"own"}'::jsonb
WHERE integration_prefs->>'supabase' = 'forge';