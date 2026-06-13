-- FORGE: search_path apenas em funções AetherForge presentes neste projeto
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'match_rag_chunks'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.match_rag_chunks SET search_path = public, extensions';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_rag_chunks'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.search_rag_chunks SET search_path = public, extensions';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_codex_genomes'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.search_codex_genomes SET search_path = public, extensions';
  END IF;
END $$;