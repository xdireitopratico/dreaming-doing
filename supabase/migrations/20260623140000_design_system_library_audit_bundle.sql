-- Audit bundle for design_system_library
-- Adds richer extraction artifacts for debugging, validation, and UI inspection.

ALTER TABLE design_system_library
  ADD COLUMN IF NOT EXISTS raw_html TEXT,
  ADD COLUMN IF NOT EXISTS clean_html TEXT,
  ADD COLUMN IF NOT EXISTS provider_trace TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS confidence INTEGER,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

ALTER TABLE design_system_library
  DROP CONSTRAINT IF EXISTS design_system_library_confidence_check;

ALTER TABLE design_system_library
  ADD CONSTRAINT design_system_library_confidence_check
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100));
