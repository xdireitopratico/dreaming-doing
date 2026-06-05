-- Helpers read-only para MCP Supabase no agent-run

CREATE OR REPLACE FUNCTION public.forge_list_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tablename::text
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.forge_describe_table(p_table text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'column', column_name,
        'type', data_type,
        'nullable', is_nullable = 'YES'
      )
      ORDER BY ordinal_position
    ),
    '[]'::jsonb
  )
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table;
$$;

CREATE OR REPLACE FUNCTION public.forge_agent_sql_readonly(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  normalized text;
BEGIN
  normalized := lower(trim(p_sql));
  IF normalized !~ '^select\s' THEN
    RAISE EXCEPTION 'Apenas SELECT permitido';
  END IF;
  IF normalized ~ '(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|execute)' THEN
    RAISE EXCEPTION 'SQL contém operação não permitida';
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(row_to_json(q)), ''[]''::jsonb) FROM (%s) q', p_sql) INTO result;
  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.forge_list_public_tables() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forge_describe_table(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forge_agent_sql_readonly(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forge_list_public_tables() TO service_role;
GRANT EXECUTE ON FUNCTION public.forge_describe_table(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.forge_agent_sql_readonly(text) TO service_role;