-- Fix v_chat_messages view - remove conversation_id column that's causing structure mismatch
DROP VIEW IF EXISTS crm.v_chat_messages;

CREATE OR REPLACE VIEW crm.v_chat_messages AS
SELECT 
  m.id,
  m.lead_id,
  m.content,
  m.direction,
  CASE
    WHEN m.direction::text = 'inbound'::text THEN 1
    WHEN m.direction::text = 'outbound'::text THEN 2
    ELSE NULL::integer
  END AS direction_code,
  m.sent_at,
  l.name AS lead_name,
  u.name AS sender_name
FROM crm.message_history m
JOIN crm.leads l ON m.lead_id = l.id
LEFT JOIN crm.users u ON m.created_by = u.id
ORDER BY m.sent_at;;
