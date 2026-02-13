-- Add notes column to leads table
ALTER TABLE crm.leads 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Recreate current_user_role function to fetch from crm.users
DROP FUNCTION IF EXISTS crm.current_user_role() CASCADE;

CREATE OR REPLACE FUNCTION crm.current_user_role()
RETURNS crm.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT role 
  FROM crm.users 
  WHERE auth_user_id = auth.uid()
$$;

-- Recreate RLS policies that depend on the function
CREATE POLICY "Users can view leads"
ON crm.leads
FOR SELECT
TO authenticated
USING (
  crm.current_user_role() = 'ADMIN' OR 
  owner_id = auth.uid()
);

CREATE POLICY "Vendedores can manage own leads"
ON crm.leads
FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can view opportunities"
ON crm.opportunities
FOR SELECT
TO authenticated
USING (
  crm.current_user_role() = 'ADMIN' OR 
  lead_id IN (SELECT id FROM crm.leads WHERE owner_id = auth.uid())
);

CREATE POLICY "Users can create opportunities"
ON crm.opportunities
FOR INSERT
TO authenticated
WITH CHECK (
  crm.current_user_role() = 'ADMIN' OR 
  lead_id IN (SELECT id FROM crm.leads WHERE owner_id = auth.uid())
);

CREATE POLICY "Users can view messages"
ON crm.message_history
FOR SELECT
TO authenticated
USING (
  crm.current_user_role() = 'ADMIN' OR 
  lead_id IN (SELECT id FROM crm.leads WHERE owner_id = auth.uid())
);

CREATE POLICY "Users can create messages"
ON crm.message_history
FOR INSERT
TO authenticated
WITH CHECK (
  crm.current_user_role() = 'ADMIN' OR 
  lead_id IN (SELECT id FROM crm.leads WHERE owner_id = auth.uid())
);

-- Drop and recreate v_lead_details view to include notes
DROP VIEW IF EXISTS crm.v_lead_details;

CREATE VIEW crm.v_lead_details AS
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
  l.notes,
  u.name as owner_name,
  o.value,
  o.connection_level,
  o.status as opportunity_status
FROM crm.leads l
LEFT JOIN crm.users u ON l.owner_id = u.id
LEFT JOIN crm.opportunities o ON l.id = o.lead_id
ORDER BY l.created_at DESC;;
