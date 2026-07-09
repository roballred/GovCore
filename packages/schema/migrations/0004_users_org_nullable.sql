-- 0004_users_org_nullable — relax users.organization_id (GovEA ADR-0006, #104).
--
-- organization_id is a denormalized *home* pointer, not the authority on org
-- access (user_organization_memberships is). As NOT NULL + ON DELETE CASCADE it
-- carried two defects:
--   1. Deleting a user's home org cascade-deleted their identity even when their
--      memberships in OTHER orgs were still valid — a multi-org data-loss bug —
--      and orphaned the audit_log rows that reference the user id.
--   2. A platform-only operator (an instance_role holder with no tenant org)
--      could not exist, since every identity was forced into an org.
--
-- Relax to nullable + ON DELETE SET NULL. On org deletion the home pointer nulls,
-- per-org access drops via the membership table's own cascade, and deactivating
-- a user whose last active membership is gone is an app-level policy, not a DB
-- cascade. org-scoped tables keep NOT NULL organization_id (the tenancy/RLS
-- contract is unchanged); only the identity home pointer relaxes.
--
-- Idempotent: the migrate runner tracks applied files, but re-running is safe.

ALTER TABLE govcore.users ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE govcore.users DROP CONSTRAINT IF EXISTS users_organization_id_fkey;

ALTER TABLE govcore.users
  ADD CONSTRAINT users_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES govcore.organizations (id) ON DELETE SET NULL;
