import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_PROVIDERS = new Set(["openai", "google"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeSettings(row: any) {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    is_active: row.is_active,
    has_api_key: Boolean(row.api_key),
    updated_at: row.updated_at,
  };
}

async function getActiveSettingsRow(supabase: any) {
  return await supabase
    .from("llm_settings")
    .select("id, provider, model, is_active, updated_at, api_key")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: "Segredos do Supabase nao configurados na Edge Function." }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (req.method === "GET") {
      const { data, error } = await getActiveSettingsRow(supabase);

      if (error) {
        console.error("llm-settings GET error:", error);
        return jsonResponse({ error: "Falha ao carregar configuracoes de LLM." }, 500);
      }

      return jsonResponse({
        settings: data ? sanitizeSettings(data) : null,
      });
    }

    if (req.method === "POST") {
      let payload: any;

      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ error: "Payload JSON invalido." }, 400);
      }

      const provider = typeof payload.provider === "string" ? payload.provider.trim().toLowerCase() : "";
      const model = typeof payload.model === "string" ? payload.model.trim() : "";
      const incomingApiKey = typeof payload.api_key === "string" ? payload.api_key.trim() : "";

      if (!ALLOWED_PROVIDERS.has(provider)) {
        return jsonResponse({ error: "Provider invalido. Use openai ou google." }, 400);
      }

      if (!model) {
        return jsonResponse({ error: "Modelo e obrigatorio." }, 400);
      }

      const { data: activeRow, error: activeError } = await getActiveSettingsRow(supabase);

      if (activeError) {
        console.error("llm-settings POST load error:", activeError);
        return jsonResponse({ error: "Falha ao carregar configuracoes atuais." }, 500);
      }

      if (activeRow) {
        const { error: deactivateOthersError } = await supabase
          .from("llm_settings")
          .update({ is_active: false })
          .eq("is_active", true)
          .neq("id", activeRow.id);

        if (deactivateOthersError) {
          console.error("llm-settings deactivate others error:", deactivateOthersError);
          return jsonResponse({ error: "Falha ao normalizar configuracoes ativas." }, 500);
        }

        const updatePayload: any = {
          provider,
          model,
          is_active: true,
        };

        if (incomingApiKey) {
          updatePayload.api_key = incomingApiKey;
        }

        const { data: updated, error: updateError } = await supabase
          .from("llm_settings")
          .update(updatePayload)
          .eq("id", activeRow.id)
          .select("id, provider, model, is_active, updated_at, api_key")
          .single();

        if (updateError) {
          console.error("llm-settings update error:", updateError);
          return jsonResponse({ error: "Falha ao atualizar configuracoes de LLM." }, 500);
        }

        return jsonResponse({ settings: sanitizeSettings(updated) });
      }

      if (!incomingApiKey) {
        return jsonResponse({ error: "API Key e obrigatoria na primeira configuracao." }, 400);
      }

      const { error: deactivateError } = await supabase
        .from("llm_settings")
        .update({ is_active: false })
        .eq("is_active", true);

      if (deactivateError) {
        console.error("llm-settings deactivate error:", deactivateError);
        return jsonResponse({ error: "Falha ao preparar configuracao ativa." }, 500);
      }

      const { data: inserted, error: insertError } = await supabase
        .from("llm_settings")
        .insert({
          provider,
          model,
          api_key: incomingApiKey,
          is_active: true,
        })
        .select("id, provider, model, is_active, updated_at, api_key")
        .single();

      if (insertError) {
        console.error("llm-settings insert error:", insertError);
        return jsonResponse({ error: "Falha ao salvar configuracoes de LLM." }, 500);
      }

      return jsonResponse({ settings: sanitizeSettings(inserted) });
    }

    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  } catch (error) {
    console.error("llm-settings unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    return jsonResponse({ error: errorMessage }, 500);
  }
});
