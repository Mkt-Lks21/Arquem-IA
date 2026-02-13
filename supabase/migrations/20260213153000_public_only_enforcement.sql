-- Enforce single-project usage and public-schema-only database access.

-- Keep only public metadata and table mappings.
DELETE FROM public.database_metadata_cache
WHERE schema_name <> 'public';

DELETE FROM public.agent_tables
WHERE schema_name <> 'public';

-- Add schema guards to prevent non-public inserts.
ALTER TABLE public.database_metadata_cache
DROP CONSTRAINT IF EXISTS database_metadata_cache_schema_name_public_check;

ALTER TABLE public.database_metadata_cache
ADD CONSTRAINT database_metadata_cache_schema_name_public_check
CHECK (schema_name = 'public');

ALTER TABLE public.agent_tables
DROP CONSTRAINT IF EXISTS agent_tables_schema_name_public_check;

ALTER TABLE public.agent_tables
ADD CONSTRAINT agent_tables_schema_name_public_check
CHECK (schema_name = 'public');

-- Restrict metadata function to schema public only.
CREATE OR REPLACE FUNCTION public.app_get_database_metadata()
RETURNS TABLE(
  schema_name text,
  table_name text,
  column_name text,
  data_type text,
  is_nullable boolean,
  column_default text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.table_schema::text AS schema_name,
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    (c.is_nullable = 'YES') AS is_nullable,
    c.column_default::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  ORDER BY c.table_name, c.ordinal_position;
$$;

-- Restrict execution function to SELECT-only statements on schema public.
CREATE OR REPLACE FUNCTION public.app_execute_safe_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  upper_query text;
  schema_ref text;
BEGIN
  query_text := trim(query_text);
  upper_query := upper(query_text);

  IF query_text = '' THEN
    RAISE EXCEPTION 'A query nao pode ser vazia.';
  END IF;

  IF position(';' in query_text) > 0 THEN
    RAISE EXCEPTION 'Nao use ponto e virgula (;).';
  END IF;

  IF upper_query NOT LIKE 'SELECT%' THEN
    RAISE EXCEPTION 'Apenas SELECT e permitido.';
  END IF;

  IF upper_query ~ '\m(INSERT|DELETE|UPDATE|DROP|TRUNCATE|ALTER|GRANT|REVOKE|EXEC|EXECUTE|CREATE|COPY|VACUUM|ANALYZE)\M' THEN
    RAISE EXCEPTION 'Operacao nao permitida. Apenas SELECT no schema public e permitido.';
  END IF;

  FOR schema_ref IN
    SELECT lower((m)[1])
    FROM regexp_matches(query_text, '(?i)\m(?:from|join)\s+(?:only\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\.', 'g') AS m
  LOOP
    IF schema_ref <> 'public' THEN
      RAISE EXCEPTION 'Schema "%" nao permitido. Use apenas o schema public.', schema_ref;
    END IF;
  END LOOP;

  EXECUTE format('SELECT json_agg(t) FROM (%s) t', query_text) INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;
