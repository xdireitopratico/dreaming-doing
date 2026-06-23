-- Evolve the Design DNA job contract and expose a library overview summary.
-- This lets the UI distinguish completed / partial / blocked runs and lets the
-- Design Library surface smoke/test duplication explicitly.

ALTER TABLE design_dna_jobs
  DROP CONSTRAINT IF EXISTS design_dna_jobs_status_check;

ALTER TABLE design_dna_jobs
  ADD CONSTRAINT design_dna_jobs_status_check
  CHECK (status IN ('pending', 'running', 'partial', 'blocked', 'completed', 'failed', 'canceled'));

CREATE OR REPLACE FUNCTION design_library_overview(
  include_archived BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH all_rows AS (
    SELECT source_url, ingest_kind, is_archived
    FROM design_system_library
  ),
  base AS (
    SELECT source_url, ingest_kind, is_archived
    FROM all_rows
    WHERE include_archived OR is_archived = FALSE
  ),
  ingest_counts AS (
    SELECT
      COUNT(*) AS total_rows,
      COUNT(*) FILTER (WHERE ingest_kind = 'production') AS production_rows,
      COUNT(*) FILTER (WHERE ingest_kind = 'curated') AS curated_rows,
      COUNT(*) FILTER (WHERE ingest_kind = 'smoke') AS smoke_rows,
      COUNT(*) FILTER (WHERE ingest_kind = 'manual') AS manual_rows,
      (SELECT COUNT(*) FROM all_rows WHERE is_archived) AS archived_rows,
      COUNT(DISTINCT source_url) AS distinct_source_urls
    FROM base
  ),
  duplicate_stats AS (
    SELECT
      COUNT(*) AS duplicate_groups,
      COALESCE(SUM(source_count - 1), 0) AS duplicate_rows
    FROM (
      SELECT source_url, COUNT(*) AS source_count
      FROM base
      GROUP BY source_url
      HAVING COUNT(*) > 1
    ) grouped
  )
  SELECT jsonb_build_object(
    'total_rows', ingest_counts.total_rows,
    'production_rows', ingest_counts.production_rows,
    'curated_rows', ingest_counts.curated_rows,
    'smoke_rows', ingest_counts.smoke_rows,
    'manual_rows', ingest_counts.manual_rows,
    'archived_rows', ingest_counts.archived_rows,
    'distinct_source_urls', ingest_counts.distinct_source_urls,
    'duplicate_groups', duplicate_stats.duplicate_groups,
    'duplicate_rows', duplicate_stats.duplicate_rows
  )
  FROM ingest_counts, duplicate_stats;
$$;

GRANT EXECUTE ON FUNCTION design_library_overview(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION design_library_overview(BOOLEAN) TO service_role;
