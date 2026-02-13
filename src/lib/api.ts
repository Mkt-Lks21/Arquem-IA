import { supabase } from "@/integrations/supabase/client";
import { Message, Conversation, LLMSettings, DatabaseMetadata, Agent, AgentTable } from "@/types/database";

export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createConversation(title?: string, agentId?: string): Promise<Conversation> {
  const insertData: any = { title: title || "Nova Conversa" };
  if (agentId) insertData.agent_id = agentId;
  
  const { data, error } = await supabase
    .from("conversations")
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createMessage(
  conversationId: string,
  role: string,
  content: string
): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getLLMSettings(): Promise<LLMSettings | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/llm-settings`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    let errorMessage = "Failed to load LLM settings";
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
    } catch {
      // Ignore JSON parse failures and keep default message.
    }
    throw new Error(errorMessage);
  }

  const payload = await response.json();
  return payload.settings || null;
}

export async function saveLLMSettings(settings: {
  provider: string;
  model: string;
  api_key?: string;
}): Promise<LLMSettings> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/llm-settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    let errorMessage = "Failed to save LLM settings";
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
    } catch {
      // Ignore JSON parse failures and keep default message.
    }
    throw new Error(errorMessage);
  }

  const payload = await response.json();
  if (!payload.settings) {
    throw new Error("Resposta invalida ao salvar configuracao de LLM");
  }

  return payload.settings;
}

export async function getMetadata(): Promise<DatabaseMetadata[]> {
  const { data, error } = await supabase
    .from("database_metadata_cache")
    .select("*")
    .eq("schema_name", "public")
    .order("schema_name, table_name, column_name");

  if (error) throw error;
  return data || [];
}

export async function refreshMetadata(): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/fetch-metadata`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to refresh metadata");
  }
}

export async function sendChatMessage(
  messages: { role: string; content: string }[],
  conversationId: string,
  agentId?: string
): Promise<Response> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  return fetch(`${supabaseUrl}/functions/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ messages, conversationId, agentId }),
  });
}

// ===== AGENTS API =====

export async function getAgents(): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as Agent[];
}

export async function getAgent(id: string): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as unknown as Agent;
}

export async function createAgent(agent: {
  name: string;
  description?: string;
  system_prompt?: string | null;
}): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .insert(agent)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Agent;
}

export async function updateAgent(id: string, agent: {
  name?: string;
  description?: string;
  system_prompt?: string | null;
}): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .update(agent)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Agent;
}

export async function deleteAgent(id: string): Promise<void> {
  const { error } = await supabase.from("agents").delete().eq("id", id);
  if (error) throw error;
}

export async function getAgentTables(agentId: string): Promise<AgentTable[]> {
  const { data, error } = await supabase
    .from("agent_tables")
    .select("*")
    .eq("agent_id", agentId);

  if (error) throw error;
  return (data || []) as unknown as AgentTable[];
}

export async function setAgentTables(
  agentId: string,
  tables: { schema_name: string; table_name: string }[]
): Promise<void> {
  // Delete existing
  await supabase.from("agent_tables").delete().eq("agent_id", agentId);

  // Insert new
  if (tables.length > 0) {
    const { error } = await supabase
      .from("agent_tables")
      .insert(tables.map((t) => ({ agent_id: agentId, ...t })));
    if (error) throw error;
  }
}

export async function executeQuery(query: string): Promise<any[]> {
  const { data, error } = await supabase.rpc("app_execute_safe_query", {
    query_text: query,
  });

  if (error) throw error;
  return (data as any[]) || [];
}
