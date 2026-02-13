import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: columns, error } = await supabase.rpc("app_get_database_metadata");

    if (error) {
      return new Response(
        JSON.stringify({
          error: "Funcao app_get_database_metadata nao encontrada. Execute as migracoes primeiro.",
          columns: [],
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await supabase.from("database_metadata_cache").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    if (columns && columns.length > 0) {
      const cacheData = columns.map((col: any) => ({
        schema_name: col.schema_name,
        table_name: col.table_name,
        column_name: col.column_name,
        data_type: col.data_type,
        is_nullable: col.is_nullable,
        column_default: col.column_default,
      }));

      await supabase.from("database_metadata_cache").insert(cacheData);
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: columns?.length || 0,
        message: `Cache atualizado com ${columns?.length || 0} colunas`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Fetch metadata error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao buscar metadados";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
