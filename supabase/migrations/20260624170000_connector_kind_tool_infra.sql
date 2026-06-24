-- Libera os kinds de infraestrutura que o connector-upsert já aceita.
-- Sem isso, o upsert falha com "invalid input value for enum connector_kind"
-- ao salvar web_search, web_scrape e browser_runtime.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'connector_kind' AND e.enumlabel = 'web_search'
  ) THEN
    ALTER TYPE public.connector_kind ADD VALUE 'web_search';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'connector_kind' AND e.enumlabel = 'web_scrape'
  ) THEN
    ALTER TYPE public.connector_kind ADD VALUE 'web_scrape';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'connector_kind' AND e.enumlabel = 'browser_runtime'
  ) THEN
    ALTER TYPE public.connector_kind ADD VALUE 'browser_runtime';
  END IF;
END $$;
