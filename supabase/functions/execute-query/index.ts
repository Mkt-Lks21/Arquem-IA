import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "DELETE",
  "UPDATE",
  "DROP",
  "TRUNCATE",
  "ALTER",
  "GRANT",
  "REVOKE",
  "EXEC",
  "EXECUTE",
  "CREATE",
  "COPY",
  "VACUUM",
  "ANALYZE",
];

function validateQuery(query: string): { valid: boolean; error?: string } {
  const trimmed = query.trim();
  const upperQuery = trimmed.toUpperCase();

  if (!upperQuery.startsWith("SELECT")) {
    return {
      valid: false,
      error: "A query deve comecar com SELECT.",
    };
  }

  if (trimmed.includes(";")) {
    return {
      valid: false,
      error: "Nao use ponto e virgula (;).",
    };
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upperQuery)) {
      return {
        valid: false,
        error: `Operacao "${keyword}" nao permitida. Apenas SELECT no schema public e permitido.`,
      };
    }
  }

  const schemaRefRegex = /\b(?:from|join)\s+(?:only\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\./gi;
  let match: RegExpExecArray | null;

  while ((match = schemaRefRegex.exec(trimmed)) !== null) {
    const schemaName = match[1].toLowerCase();
    if (schemaName !== "public") {
      return {
        valid: false,
        error: `Schema "${schemaName}" nao permitido. Use apenas o schema public.`,
      };
    }
  }

  return { valid: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Query e obrigatoria" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validation = validateQuery(query);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc("app_execute_safe_query", {
      query_text: query,
    });

    if (error) {
      return new Response(JSON.stringify({ error: `Erro na execucao: ${error.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data,
        rowCount: Array.isArray(data) ? data.length : 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Execute query error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao executar query";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
