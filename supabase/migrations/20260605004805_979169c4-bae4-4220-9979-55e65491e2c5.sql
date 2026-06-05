-- Add netlify to connector_kind enum (idempotent guard)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'connector_kind' AND e.enumlabel = 'netlify'
  ) THEN
    ALTER TYPE public.connector_kind ADD VALUE 'netlify';
  END IF;
END $$;

-- profiles: integration prefs + trial counter
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS integration_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trial_messages_remaining integer NOT NULL DEFAULT 8;