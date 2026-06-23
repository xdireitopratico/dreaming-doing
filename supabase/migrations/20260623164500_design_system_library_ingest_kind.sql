-- Distinguishes production references from curated smoke/test/manual ingests.
-- Also prevents duplicate rows for the same source_url + ingest_kind pair.

ALTER TABLE design_system_library
  ADD COLUMN IF NOT EXISTS ingest_kind TEXT NOT NULL DEFAULT 'production';

ALTER TABLE design_system_library
  DROP CONSTRAINT IF EXISTS design_system_library_ingest_kind_check;

ALTER TABLE design_system_library
  ADD CONSTRAINT design_system_library_ingest_kind_check
  CHECK (ingest_kind IN ('production', 'curated', 'smoke', 'manual'));

WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY source_url, ingest_kind
      ORDER BY extracted_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM design_system_library
)
DELETE FROM design_system_library d
USING ranked r
WHERE d.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dsl_source_ingest_kind_unique
  ON design_system_library (source_url, ingest_kind);

CREATE INDEX IF NOT EXISTS idx_dsl_ingest_kind
  ON design_system_library (ingest_kind, created_at DESC);
