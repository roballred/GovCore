-- 0003_organization_lifecycle — org status (active | suspended | archived).
--
-- Lifecycle was previously unmodeled; the only escape hatch was
-- organizations.metadata, which nothing enforced. Suspension/archival now live
-- in first-class columns so the createAuth and tenantAction gates can bind to
-- them (design: an org must be `active` to resolve a session or run a tenant
-- transaction). `organizations` is not under RLS, so the runtime pool reads
-- these columns without a tenant GUC.

ALTER TABLE govcore.organizations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid;

-- Fast lookup / partial scans of non-active tenants for the operator console.
CREATE INDEX IF NOT EXISTS organizations_status_idx ON govcore.organizations (status);
