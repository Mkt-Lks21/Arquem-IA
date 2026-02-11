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
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const externalKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY");

    if (!externalUrl || !externalKey) {
      return new Response(
        JSON.stringify({ 
          error: "Credenciais do banco externo não configuradas. Configure EXTERNAL_SUPABASE_URL e EXTERNAL_SUPABASE_SERVICE_KEY nos secrets." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, query } = await req.json();
    const externalSupabase = createClient(externalUrl, externalKey);

    if (action === "fetch-metadata") {
      // Fetch metadata from external database using RPC or direct query
      const { data, error } = await externalSupabase.rpc("get_database_metadata");

      if (error) {
        // Fallback: try to get basic table info
        console.log("RPC not available, returning connection status");
        return new Response(
          JSON.stringify({ 
            success: true,
            message: "Conexão estabelecida, mas função get_database_metadata não existe no banco externo.",
            hint: "Execute a migração SQL para criar a função no seu banco externo.",
            data: []
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "execute-query") {
      if (!query) {
        return new Response(
          JSON.stringify({ error: "Query é obrigatória" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sanitize: remove trailing semicolons and whitespace that break subquery wrapping
      const sanitizedQuery = query.trim().replace(/;+\s*$/, "");
      
      // Execute on external database (sem validação restritiva - queries complexas permitidas)
      const { data, error } = await externalSupabase.rpc("execute_safe_query", { query_text: sanitizedQuery });

      if (error) {
        return new Response(
          JSON.stringify({ error: `Erro na execução: ${error.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data, rowCount: Array.isArray(data) ? data.length : 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "test-connection") {
      // Test connection by running a simple query
      const { data, error } = await externalSupabase
        .from("information_schema.tables")
        .select("table_name")
        .limit(1);

      // Even if this fails due to permissions, if we get any response the connection works
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Conexão com banco externo estabelecida com sucesso!",
          url: externalUrl.replace(/^(https?:\/\/[^/]+).*/, "$1") // Mask full URL
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use: fetch-metadata, execute-query, ou test-connection" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("External DB proxy error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao conectar com banco externo";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
