-- Criar view que combina leads com opportunities
CREATE OR REPLACE VIEW crm.v_lead_details AS
SELECT 
  l.id,
  l.name as lead_name,
  l.email,
  l.contact_phone,
  l."Fonte" as source,
  l.status,
  l.created_at,
  l.updated_at,
  l.last_message_at,
  l.last_city,
  l.last_region,
  l.last_country,
  l.lead_number,
  l.owner_id,
  u.name as owner_name,
  -- Dados da opportunity
  o.value,
  o.connection_level,
  o.status as opportunity_status
FROM crm.leads l
LEFT JOIN crm.users u ON l.owner_id = u.id
LEFT JOIN crm.opportunities o ON l.id = o.lead_id
ORDER BY l.created_at DESC;;
