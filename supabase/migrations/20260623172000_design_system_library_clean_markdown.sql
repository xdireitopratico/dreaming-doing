-- Store a sanitized markdown artifact alongside the original scrape output.
-- This keeps the raw provider result auditable while giving the UI and LLM
-- a structured, cleaned representation of the same page.

ALTER TABLE design_system_library
  ADD COLUMN IF NOT EXISTS clean_markdown TEXT;
