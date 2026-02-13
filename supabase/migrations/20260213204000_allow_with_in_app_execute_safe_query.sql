-- Allow CTE-based read queries that start with WITH in app_execute_safe_query.
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

  IF upper_query NOT LIKE 'SELECT%' AND upper_query NOT LIKE 'WITH%' THEN
    RAISE EXCEPTION 'Apenas SELECT e permitido (incluindo CTE iniciando com WITH).';
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
