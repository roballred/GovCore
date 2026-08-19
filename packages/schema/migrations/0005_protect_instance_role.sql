-- 0005_protect_instance_role — privilege-plane guard for users.instance_role (#153).
--
-- RLS on users only keys off organization_id. The runtime role has UPDATE on
-- users, so a tenant transaction could previously escalate:
--   UPDATE govcore.users SET instance_role = 'instance_admin' WHERE id = <self>;
-- After JWT refresh (~5 min), operatorAction would trust the elevated claim.
--
-- Defense: a BEFORE INSERT OR UPDATE trigger rejects setting/changing
-- instance_role unless the session is the privilege plane — superuser,
-- BYPASSRLS (authDb / operatorDb), or the table owner (migrate/setup).
-- Column-level REVOKE UPDATE (instance_role) in provisionRuntimeRole is
-- complementary (#152/#153); the trigger is the binding guarantee.

CREATE OR REPLACE FUNCTION govcore.is_privilege_plane()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles
      WHERE rolname = current_user
        AND (rolsuper OR rolbypassrls)
    )
    OR current_user = (
      SELECT pg_catalog.pg_get_userbyid(c.relowner)
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'govcore'
        AND c.relname = 'users'
        AND c.relkind = 'r'
    );
$$;

CREATE OR REPLACE FUNCTION govcore.users_protect_instance_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.instance_role IS NOT NULL AND NOT govcore.is_privilege_plane() THEN
      RAISE EXCEPTION 'govcore.users.instance_role is privilege-plane only — cannot set from the runtime role'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.instance_role IS DISTINCT FROM OLD.instance_role
       AND NOT govcore.is_privilege_plane() THEN
      RAISE EXCEPTION 'govcore.users.instance_role is privilege-plane only — cannot change from the runtime role'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_protect_instance_role ON govcore.users;
CREATE TRIGGER users_protect_instance_role
  BEFORE INSERT OR UPDATE ON govcore.users
  FOR EACH ROW
  EXECUTE FUNCTION govcore.users_protect_instance_role();

COMMENT ON FUNCTION govcore.is_privilege_plane() IS
  'True when current_user is superuser, BYPASSRLS, or owner of govcore.users (#153).';

COMMENT ON FUNCTION govcore.users_protect_instance_role() IS
  'Blocks runtime escalation via users.instance_role INSERT/UPDATE (#153).';
