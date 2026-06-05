-- E2B sandbox connector (API Keys → connector-upsert kind=e2b)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'connector_kind' AND e.enumlabel = 'e2b'
  ) THEN
    ALTER TYPE public.connector_kind ADD VALUE 'e2b';
  END IF;
END $$;