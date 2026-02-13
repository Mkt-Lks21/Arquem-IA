-- Harden llm_settings access and enforce a single active configuration.

-- Remove public access to sensitive llm_settings rows.
DROP POLICY IF EXISTS "Allow public read on llm_settings" ON public.llm_settings;
DROP POLICY IF EXISTS "Allow public insert on llm_settings" ON public.llm_settings;
DROP POLICY IF EXISTS "Allow public update on llm_settings" ON public.llm_settings;

-- Keep only the most recent active configuration.
WITH ranked_active AS (
  SELECT
    id,
    row_number() OVER (
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.llm_settings
  WHERE is_active = true
)
UPDATE public.llm_settings s
SET is_active = false
FROM ranked_active r
WHERE s.id = r.id
  AND r.rn > 1;

-- Guarantee at most one active row moving forward.
CREATE UNIQUE INDEX IF NOT EXISTS llm_settings_single_active_idx
  ON public.llm_settings (is_active)
  WHERE is_active = true;
