-- Migration: Weekly curated Design DNA extraction via pg_cron
-- Calls design-dna-scheduler with action=trigger_curated every Monday at 03:00 UTC.
-- Requires pg_cron and pg_net extensions.
--
-- If pg_cron is not enabled on the Supabase project, enable it via:
--   Dashboard > Database > Extensions > Enable "pg_cron"
--   Dashboard > Database > Extensions > Enable "pg_net"
--
-- The service_role_key is read from Vault (set once via Dashboard > Database > Vault)
-- or from the GUC `app.service_role_key` set via ALTER DATABASE.
-- To set via Vault:
--   SELECT vault.create_secret('https://dpduljngdurfpmaclffa.supabase.co/service-role-key', 'service_role_key');
-- Then in the cron body, use: vault.read_secret('service_role_key')
-- For simplicity here we use the GUC approach — set it once manually:
--   ALTER DATABASE postgres SET app.service_role_key = 'eyJ...your-key...';

-- Ensure extensions are available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Only schedule if pg_cron is available; otherwise log a notice.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    -- Remove existing job if rerunning migration
    PERFORM cron.unschedule('design-dna-weekly-curated')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'design-dna-weekly-curated');

    -- Schedule weekly trigger
    PERFORM cron.schedule(
      'design-dna-weekly-curated',
      '0 3 * * 1',
      $cron_body$
      SELECT extensions.net.http_post(
        url := 'https://dpduljngdurfpmaclffa.supabase.co/functions/v1/design-dna-scheduler',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := jsonb_build_object('action', 'trigger_curated')
      );
      $cron_body$
    );

    RAISE NOTICE 'pg_cron job design-dna-weekly-curated scheduled (Monday 03:00 UTC)';
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping schedule. Enable it in Dashboard > Database > Extensions and run manually.';
  END IF;
END
$$;
