-- 0001_platform_security — append-only audit + Row-Level Security.
--
-- Hand-authored: Drizzle manages neither triggers nor RLS. These are core's
-- security properties (design §13.1–§13.2), applied by govcore-migrate.

-- ── Append-only audit log (carried from GovEA #417) ─────────────────────────
CREATE OR REPLACE FUNCTION govcore.audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only — UPDATE and DELETE are not permitted';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON govcore.audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON govcore.audit_log
  FOR EACH ROW EXECUTE FUNCTION govcore.audit_log_immutable();

DROP TRIGGER IF EXISTS audit_log_no_delete ON govcore.audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON govcore.audit_log
  FOR EACH ROW EXECUTE FUNCTION govcore.audit_log_immutable();

-- ── Row-Level Security: tenant isolation by the active-org GUC ──────────────
--
-- The runtime sets `app.current_org` per request, transaction-locally, inside
-- the tenant transaction (design §13.1): `select set_config('app.current_org',
-- $org, true)`. When the GUC is unset, current_setting(..., true) returns NULL,
-- the comparison is NULL (not true), and every row is hidden — deny by default.
--
-- FORCE so the policy binds even for the table owner; the app connects as a
-- NON-OWNER runtime role (design §13.2). One sanctioned bypass (break-glass /
-- act-as) is a later phase; nothing bypasses RLS today.
--
-- Scope (this slice): users, memberships, audit_log. NOT applied to
-- `organizations` (the tenant root — visibility is membership-based, a later
-- policy) or the Auth.js tables (read before a tenant context exists).

ALTER TABLE govcore.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE govcore.users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_org_isolation ON govcore.users;
CREATE POLICY users_org_isolation ON govcore.users
  USING (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

ALTER TABLE govcore.user_organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE govcore.user_organization_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_org_isolation ON govcore.user_organization_memberships;
CREATE POLICY memberships_org_isolation ON govcore.user_organization_memberships
  USING (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

ALTER TABLE govcore.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE govcore.audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_org_isolation ON govcore.audit_log;
-- Reads scoped to the active org (or org-less platform events); inserts allowed
-- (e.g. cross-org support actions record an audit row). Immutability is the
-- trigger above; UPDATE/DELETE never reach the policy.
CREATE POLICY audit_org_isolation ON govcore.audit_log
  USING (organization_id IS NULL OR organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (true);
