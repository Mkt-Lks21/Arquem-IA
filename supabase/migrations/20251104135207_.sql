-- FASE 3: Melhorar view v_lead_list com campos adicionais
DROP VIEW IF EXISTS crm.v_lead_list;

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
  l.last_city,
  l.last_region,
  l.last_country,
  l.lead_number,
  u.name AS owner_name,
  l.owner_id
FROM crm.leads l
LEFT JOIN crm.users u ON l.owner_id = u.id;

-- FASE 7: Criar RPC para marcar mensagens como lidas
CREATE OR REPLACE FUNCTION crm.rpc_mark_messages_read(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
BEGIN
  UPDATE crm.message_history
  SET read_at = now()
  WHERE lead_id = p_lead_id
    AND direction = 'inbound'
    AND read_at IS NULL;
END;
$$;;
