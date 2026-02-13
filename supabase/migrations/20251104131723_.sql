-- ========================================
-- AJUSTES E CRIAÇÃO DE VIEWS/RPCs
-- ========================================

-- 1. Adicionar colunas faltantes
ALTER TABLE crm.leads ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE crm.message_history ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES crm.users(id) ON DELETE SET NULL;
ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Criar índices
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON crm.message_history(sent_at);

-- 3. Criar funções utilitárias
CREATE OR REPLACE FUNCTION crm.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
  SELECT id FROM crm.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION crm.current_user_role()
RETURNS crm.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
  SELECT role FROM crm.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION crm.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM crm.users 
    WHERE auth_user_id = auth.uid() 
    AND role = 'ADMIN'
  );
$$;

-- 4. View para lista de leads
CREATE OR REPLACE VIEW crm.v_lead_list AS
SELECT 
  l.id,
  l.name AS lead_name,
  l.email,
  l.contact_phone,
  l."Fonte" AS source,
  l.status,
  l.created_at,
  l.updated_at,
  l.last_message_at,
  u.name AS owner_name,
  u.id AS owner_id
FROM crm.leads l
LEFT JOIN crm.users u ON l.owner_id = u.id
ORDER BY l.last_message_at DESC NULLS LAST, l.created_at DESC;

-- 5. View para mensagens do chat
CREATE OR REPLACE VIEW crm.v_chat_messages AS
SELECT 
  m.id,
  m.lead_id,
  m.content,
  m.direction,
  CASE 
    WHEN m.direction = 'inbound' THEN 1
    WHEN m.direction = 'outbound' THEN 2
  END AS direction_code,
  m.conversation_id,
  m.sent_at,
  l.name AS lead_name,
  u.name AS sender_name
FROM crm.message_history m
JOIN crm.leads l ON m.lead_id = l.id
LEFT JOIN crm.users u ON m.created_by = u.id
ORDER BY m.sent_at ASC;

-- 6. RPC para criar lead
CREATE OR REPLACE FUNCTION crm.rpc_create_lead(
  p_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
DECLARE
  v_user_role crm.user_role;
  v_user_id UUID;
  v_lead_id UUID;
BEGIN
  SELECT role, id INTO v_user_role, v_user_id
  FROM crm.users WHERE auth_user_id = auth.uid();
  
  IF v_user_role = 'NENHUM' THEN
    RAISE EXCEPTION 'Conta aguardando aprovação';
  END IF;
  
  INSERT INTO crm.leads (name, email, contact_phone, "Fonte", owner_id)
  VALUES (p_name, p_email, p_contact_phone, p_source, v_user_id)
  RETURNING id INTO v_lead_id;
  
  RETURN v_lead_id;
END;
$$;

-- 7. RPC para atualizar status do lead
CREATE OR REPLACE FUNCTION crm.rpc_update_lead_status(
  p_lead_id UUID,
  p_status crm.lead_status
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
DECLARE
  v_user_role crm.user_role;
  v_user_id UUID;
  v_lead_owner UUID;
BEGIN
  SELECT role, id INTO v_user_role, v_user_id
  FROM crm.users WHERE auth_user_id = auth.uid();
  
  IF v_user_role = 'NENHUM' THEN
    RAISE EXCEPTION 'Conta aguardando aprovação';
  END IF;
  
  SELECT owner_id INTO v_lead_owner FROM crm.leads WHERE id = p_lead_id;
  
  IF v_user_role = 'VENDEDOR' AND v_lead_owner != v_user_id THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar este lead';
  END IF;
  
  UPDATE crm.leads 
  SET status = p_status, updated_at = now()
  WHERE id = p_lead_id;
END;
$$;

-- 8. RPC para criar oportunidade
CREATE OR REPLACE FUNCTION crm.rpc_create_opportunity(
  p_lead_id UUID,
  p_value NUMERIC,
  p_connection_level TEXT DEFAULT NULL,
  p_status crm.lead_status DEFAULT 'Novo'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
DECLARE
  v_user_role crm.user_role;
  v_user_id UUID;
  v_opp_id UUID;
BEGIN
  SELECT role, id INTO v_user_role, v_user_id
  FROM crm.users WHERE auth_user_id = auth.uid();
  
  IF v_user_role = 'NENHUM' THEN
    RAISE EXCEPTION 'Conta aguardando aprovação';
  END IF;
  
  INSERT INTO crm.opportunities (lead_id, value, connection_level, status, responsible_id)
  VALUES (p_lead_id, p_value, p_connection_level, p_status, v_user_id)
  RETURNING id INTO v_opp_id;
  
  RETURN v_opp_id;
END;
$$;

-- 9. RPC para obter chat
CREATE OR REPLACE FUNCTION crm.rpc_get_chat(p_lead_id UUID)
RETURNS TABLE (
  id UUID,
  lead_id UUID,
  content TEXT,
  direction VARCHAR,
  direction_code INT,
  sent_at TIMESTAMPTZ,
  lead_name VARCHAR,
  sender_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
DECLARE
  v_user_role crm.user_role;
BEGIN
  SELECT role INTO v_user_role
  FROM crm.users WHERE auth_user_id = auth.uid();
  
  IF v_user_role = 'NENHUM' THEN
    RAISE EXCEPTION 'Conta aguardando aprovação';
  END IF;
  
  RETURN QUERY
  SELECT * FROM crm.v_chat_messages WHERE crm.v_chat_messages.lead_id = p_lead_id;
END;
$$;

-- 10. RPC para enviar mensagem
CREATE OR REPLACE FUNCTION crm.rpc_send_message(
  p_lead_id UUID,
  p_content TEXT,
  p_direction crm.msg_direction,
  p_conversation_id VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
DECLARE
  v_user_role crm.user_role;
  v_user_id UUID;
  v_msg_id UUID;
BEGIN
  SELECT role, id INTO v_user_role, v_user_id
  FROM crm.users WHERE auth_user_id = auth.uid();
  
  IF v_user_role = 'NENHUM' THEN
    RAISE EXCEPTION 'Conta aguardando aprovação';
  END IF;
  
  INSERT INTO crm.message_history (lead_id, content, direction, conversation_id, created_by)
  VALUES (p_lead_id, p_content, p_direction, p_conversation_id, v_user_id)
  RETURNING id INTO v_msg_id;
  
  UPDATE crm.leads 
  SET last_message_at = now()
  WHERE id = p_lead_id;
  
  RETURN v_msg_id;
END;
$$;

-- 11. Trigger pós-signup (se não existir)
CREATE OR REPLACE FUNCTION crm.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, auth
AS $$
BEGIN
  INSERT INTO crm.users (auth_user_id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'NENHUM'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION crm.handle_new_user();

-- 12. Policies RLS
DROP POLICY IF EXISTS "Users can view own profile" ON crm.users;
CREATE POLICY "Users can view own profile" ON crm.users
  FOR SELECT USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all users" ON crm.users;
CREATE POLICY "Admins can view all users" ON crm.users
  FOR SELECT USING (crm.is_admin());

DROP POLICY IF EXISTS "Admins can update user roles" ON crm.users;
CREATE POLICY "Admins can update user roles" ON crm.users
  FOR UPDATE USING (crm.is_admin());

DROP POLICY IF EXISTS "Users can view leads" ON crm.leads;
CREATE POLICY "Users can view leads" ON crm.leads
  FOR SELECT USING (crm.current_user_role() IN ('VENDEDOR', 'ADMIN'));

DROP POLICY IF EXISTS "Admins can manage all leads" ON crm.leads;
CREATE POLICY "Admins can manage all leads" ON crm.leads
  FOR ALL USING (crm.is_admin());

DROP POLICY IF EXISTS "Vendedores can manage own leads" ON crm.leads;
CREATE POLICY "Vendedores can manage own leads" ON crm.leads
  FOR ALL USING (
    owner_id = crm.current_user_id() 
    AND crm.current_user_role() = 'VENDEDOR'
  );

DROP POLICY IF EXISTS "Users can view opportunities" ON crm.opportunities;
CREATE POLICY "Users can view opportunities" ON crm.opportunities
  FOR SELECT USING (crm.current_user_role() IN ('VENDEDOR', 'ADMIN'));

DROP POLICY IF EXISTS "Users can create opportunities" ON crm.opportunities;
CREATE POLICY "Users can create opportunities" ON crm.opportunities
  FOR INSERT WITH CHECK (crm.current_user_role() IN ('VENDEDOR', 'ADMIN'));

DROP POLICY IF EXISTS "Users can view messages" ON crm.message_history;
CREATE POLICY "Users can view messages" ON crm.message_history
  FOR SELECT USING (crm.current_user_role() IN ('VENDEDOR', 'ADMIN'));

DROP POLICY IF EXISTS "Users can create messages" ON crm.message_history;
CREATE POLICY "Users can create messages" ON crm.message_history
  FOR INSERT WITH CHECK (crm.current_user_role() IN ('VENDEDOR', 'ADMIN'));

-- 13. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE crm.message_history;
ALTER PUBLICATION supabase_realtime ADD TABLE crm.leads;
ALTER TABLE crm.message_history REPLICA IDENTITY FULL;
ALTER TABLE crm.leads REPLICA IDENTITY FULL;;
