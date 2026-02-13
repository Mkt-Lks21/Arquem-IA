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
    const { messages, conversationId, agentId } = await req.json();
    void conversationId;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get LLM settings
    const { data: settings, error: settingsError } = await supabase
      .from("llm_settings")
      .select("provider, model, api_key, is_active, updated_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      console.error("Failed to load llm_settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "Falha ao carregar configuracoes de LLM." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!settings) {
      return new Response(
        JSON.stringify({ error: "Configure suas credenciais de LLM na aba Admin primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Agent context
    let agentContext = null;
    if (agentId) {
      const { data: agent } = await supabase.from("agents").select("*").eq("id", agentId).single();

      if (agent) {
        const { data: agentTables } = await supabase
          .from("agent_tables")
          .select("*")
          .eq("agent_id", agentId)
          .eq("schema_name", "public");

        agentContext = { agent, tables: agentTables || [] };
      }
    }

    const { data: metadata } = await supabase
      .from("database_metadata_cache")
      .select("*")
      .eq("schema_name", "public")
      .order("schema_name, table_name, column_name");

    let filteredMetadata = metadata || [];

    // Filter by agent tables if applicable
    if (agentContext && agentContext.tables.length > 0) {
      const allowedTables = new Set(
        agentContext.tables.map((t: any) => `${t.schema_name}.${t.table_name}`),
      );
      filteredMetadata = filteredMetadata.filter((row: any) =>
        allowedTables.has(`${row.schema_name}.${row.table_name}`),
      );
    }

    let metadataContext = "";
    if (filteredMetadata.length > 0) {
      metadataContext = `\n\nEstrutura do banco de dados principal (schema public):\n${formatMetadata(filteredMetadata)}`;
    }

    // Build system prompt
    let behaviorPrompt: string;

    if (agentContext) {
      const tablesList = agentContext.tables
        .map((t: any) => `${t.schema_name}.${t.table_name}`)
        .join(", ");

      if (agentContext.agent.system_prompt) {
        behaviorPrompt = agentContext.agent.system_prompt;
      } else {
        behaviorPrompt = `Voce e ${agentContext.agent.name}, um assistente de inteligencia de negocios especializado nas areas: ${tablesList}.

Seu papel e atuar como um analista senior dedicado ao negocio do usuario.
Voce deve:
- Responder com profundidade e contexto de negocio, nao apenas dados brutos
- Ao apresentar resultados, sempre interpretar o que os numeros significam para o negocio (tendencias, alertas, oportunidades)
- Sugerir proativamente analises complementares relevantes
- Usar linguagem profissional mas acessivel
- Quando o usuario perguntar algo generico, direcionar para as tabelas que voce domina e oferecer opcoes de analise

Voce so tem acesso as seguintes tabelas: ${tablesList}
Gere queries APENAS sobre essas tabelas no schema public.`;
      }
    } else {
      behaviorPrompt = `Voce e um assistente especializado em analise de banco de dados PostgreSQL.

Suas capacidades:
- Criar queries SELECT de qualquer complexidade
- Usar CTEs (WITH ... AS), subqueries, window functions (ROW_NUMBER, RANK, NTILE, etc.)
- Funcoes de agregacao complexas (SUM, COUNT, AVG, GROUP BY, HAVING)
- JOINs entre multiplas tabelas
- Analises avancadas como Curva ABC, Pareto, rankings e medias moveis
- Sugerir otimizacoes e melhores praticas

CONTEXTO: O usuario esta usando o projeto Supabase principal no schema public.`;
    }

    const technicalInstructions = `
REGRAS TECNICAS OBRIGATORIAS:
- Gere APENAS queries SELECT
- Use APENAS tabelas do schema public
- NUNCA coloque ponto e virgula (;) no final da query

COMPORTAMENTO OBRIGATORIO:
- Se a pergunta exigir consulta SQL, responda SOMENTE neste formato:
[AUTO_EXECUTE]
\`\`\`sql
SELECT ...
\`\`\`
- Nao escreva narrativa, resumo ou markdown extra quando a resposta for SQL
- Nao use o placeholder [RESULTADO_DA_QUERY]
- Para mensagens que NAO exigem SQL (saudacao ou conversa geral), responda em texto simples, curto e sem markdown
- Analise os resultados para o usuario, nao apenas apresente os dados brutos.
`;

    const systemPrompt = `${behaviorPrompt}\n${technicalInstructions}\n${metadataContext}`;

    let response;

    if (settings.provider === "openai") {
      response = await callOpenAI(settings.api_key, settings.model, systemPrompt, messages);
    } else if (settings.provider === "google") {
      response = await callGemini(settings.api_key, settings.model, systemPrompt, messages);
    } else {
      throw new Error(`Provider de LLM nao suportado: ${settings.provider}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function formatMetadata(metadata: any[]): string {
  const grouped: Record<string, Record<string, string[]>> = {};

  for (const row of metadata) {
    if (!grouped[row.schema_name]) {
      grouped[row.schema_name] = {};
    }
    if (!grouped[row.schema_name][row.table_name]) {
      grouped[row.schema_name][row.table_name] = [];
    }
    grouped[row.schema_name][row.table_name].push(
      `${row.column_name} (${row.data_type}${row.is_nullable ? ", nullable" : ""})`,
    );
  }

  let result = "";
  for (const [schema, tables] of Object.entries(grouped)) {
    result += `\nSchema: ${schema}\n`;
    for (const [table, columns] of Object.entries(tables)) {
      result += `  Tabela: ${table}\n`;
      result += `    Colunas: ${columns.join(", ")}\n`;
    }
  }
  return result;
}

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, messages: any[]) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
    }),
  });
}

async function callGemini(apiKey: string, model: string, systemPrompt: string, messages: any[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map((msg: any) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
    }),
  });

  let payload: any = null;
  const rawBody = await response.text();

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const providerMessage = payload?.error?.message || rawBody || "Erro desconhecido no Gemini";
    console.error("Gemini API error:", { status: response.status, model, providerMessage });
    throw new Error(`Erro no Gemini (${response.status}): ${providerMessage}`);
  }

  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => part?.text || "")
    .join("");

  if (!text.trim()) {
    console.error("Gemini response missing text:", { model, payload });
    throw new Error("Gemini retornou resposta vazia. Verifique chave e modelo configurados.");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sseData = JSON.stringify({ choices: [{ delta: { content: text } }] });
      controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream);
}
