-- Atomic iteration increment for Prometheus build sessions
-- Prevents race condition where concurrent messages get the same round number
CREATE OR REPLACE FUNCTION public.prometheus_increment_iteration(p_session_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_iteration INT;
BEGIN
  UPDATE prometheus_build_sessions
  SET iterations = COALESCE(iterations, 0) + 1
  WHERE id = p_session_id
  RETURNING iterations INTO new_iteration;

  RETURN new_iteration;
END;
$$;
