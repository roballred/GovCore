-- 0002_platform_federation_support — federation, support access, instance config.
-- Authored DDL (design §5). Keep in sync with packages/schema/src/schema.ts.

DO $$ BEGIN
  CREATE TYPE govcore.federation_status AS ENUM ('pending', 'active', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Federation ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS govcore.org_connections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_org_id uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE,
  to_org_id   uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE,
  status      govcore.federation_status NOT NULL DEFAULT 'pending',
  created_by  uuid REFERENCES govcore.users (id),
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT unique_org_connection UNIQUE (from_org_id, to_org_id)
);

CREATE TABLE IF NOT EXISTS govcore.cross_org_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_org_id      uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE,
  source_entity_type text NOT NULL,
  source_entity_id   uuid NOT NULL,
  target_org_id      uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE,
  target_entity_type text NOT NULL,
  target_entity_id   uuid NOT NULL,
  link_type          text NOT NULL,
  status             govcore.federation_status NOT NULL DEFAULT 'pending',
  rejection_reason   text,
  flagged_for_review boolean NOT NULL DEFAULT false,
  flag_reason        text,
  created_by         uuid REFERENCES govcore.users (id),
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);

-- ── Support access (break-glass + act-as) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS govcore.break_glass_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_admin_id uuid NOT NULL REFERENCES govcore.users (id),
  target_org_id     uuid NOT NULL REFERENCES govcore.organizations (id),
  reason            text NOT NULL,
  granted_at        timestamp NOT NULL DEFAULT now(),
  expires_at        timestamp NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  approved_at       timestamp,
  approved_by       uuid REFERENCES govcore.users (id),
  revoked_at        timestamp,
  revoked_by        uuid REFERENCES govcore.users (id)
);

CREATE TABLE IF NOT EXISTS govcore.act_as_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  break_glass_session_id uuid NOT NULL REFERENCES govcore.break_glass_sessions (id),
  instance_admin_id      uuid NOT NULL REFERENCES govcore.users (id),
  target_org_id          uuid NOT NULL REFERENCES govcore.organizations (id),
  started_at             timestamp NOT NULL DEFAULT now(),
  expires_at             timestamp NOT NULL,
  ended_at               timestamp,
  end_reason             text
);

-- ── Instance / platform configuration (singletons) ─────────────────────────
CREATE TABLE IF NOT EXISTS govcore.instance_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disabled_modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS govcore.platform_config (
  id                   text PRIMARY KEY DEFAULT 'singleton',
  instance_name        text NOT NULL DEFAULT 'GovCore',
  default_theme        text NOT NULL DEFAULT 'base',
  allow_local_auth     boolean NOT NULL DEFAULT true,
  default_support_tier text,
  updated_at           timestamp NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES govcore.users (id) ON DELETE SET NULL
);

-- ── RLS: federation tables are visible to BOTH participating orgs ───────────
-- The active-org GUC must be one of the two orgs on the row. Unset GUC ⇒ no
-- match ⇒ denied (deny by default). This is also the WITH CHECK on writes, so
-- an org can only create a connection/link it participates in.
ALTER TABLE govcore.org_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE govcore.org_connections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_connections_participant ON govcore.org_connections;
CREATE POLICY org_connections_participant ON govcore.org_connections
  USING (current_setting('app.current_org', true)::uuid IN (from_org_id, to_org_id));

ALTER TABLE govcore.cross_org_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE govcore.cross_org_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cross_org_links_participant ON govcore.cross_org_links;
CREATE POLICY cross_org_links_participant ON govcore.cross_org_links
  USING (current_setting('app.current_org', true)::uuid IN (source_org_id, target_org_id));

-- break_glass_sessions, act_as_sessions, instance_settings, platform_config are
-- intentionally NOT under org-GUC RLS: they are instance-operator / singleton
-- tables. Authorization is enforced in app/@govcore/support code; a refined
-- instance-admin RLS bypass is future work (design §6.6, the single sanctioned
-- cross-org bypass).
