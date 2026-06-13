
-- Fix RLS recursion: prometheus_build_turns → prometheus_build_sessions
-- Create SECURITY DEFINER function to check session ownership without recursive RLS

CREATE OR REPLACE FUNCTION public.owns_build_session(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.prometheus_build_sessions
    WHERE id = _session_id
      AND user_id = auth.uid()
  )
$$;

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users see own session turns" ON public.prometheus_build_turns;
DROP POLICY IF EXISTS "Service inserts turns" ON public.prometheus_build_turns;

-- Recreate with SECURITY DEFINER function (no recursion)
CREATE POLICY "Users see own session turns"
ON public.prometheus_build_turns FOR SELECT TO authenticated
USING (public.owns_build_session(session_id));

CREATE POLICY "Service inserts turns"
ON public.prometheus_build_turns FOR INSERT TO authenticated
WITH CHECK (public.owns_build_session(session_id));
