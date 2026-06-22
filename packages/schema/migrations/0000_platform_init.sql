-- 0000_platform_init — GovCore platform schema (identity, tenancy, auth, audit).
--
-- Authored DDL: core owns the platform migrations (design §5). Keep in sync
-- with packages/schema/src/schema.ts. Applied by govcore-migrate, in one
-- transaction, as the owner/DDL role.

CREATE SCHEMA IF NOT EXISTS govcore;

DO $$ BEGIN
  CREATE TYPE govcore.visibility AS ENUM ('org', 'connections', 'instance');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS govcore.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique ON govcore.organizations (slug);

CREATE TABLE IF NOT EXISTS govcore.users (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE,
  last_active_organization_id uuid REFERENCES govcore.organizations (id) ON DELETE SET NULL,
  name                        text,
  email                       text NOT NULL,
  email_verified              timestamp,
  image                       text,
  password_hash               text,
  role                        text,
  instance_role               text,
  is_active                   boolean NOT NULL DEFAULT true,
  failed_login_attempts       integer NOT NULL DEFAULT 0,
  lockout_until               timestamp,
  last_password_changed_at    timestamp NOT NULL DEFAULT now(),
  created_at                  timestamp NOT NULL DEFAULT now(),
  updated_at                  timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON govcore.users (email);

CREATE TABLE IF NOT EXISTS govcore.accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES govcore.users (id) ON DELETE CASCADE,
  type                text NOT NULL,
  provider            text NOT NULL,
  provider_account_id text NOT NULL,
  refresh_token       text,
  access_token        text,
  expires_at          timestamp,
  token_type          text,
  scope               text,
  id_token            text,
  session_state       text
);

CREATE TABLE IF NOT EXISTS govcore.sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES govcore.users (id) ON DELETE CASCADE,
  expires       timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS govcore.verification_tokens (
  identifier text NOT NULL,
  token      text NOT NULL,
  expires    timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS govcore.user_organization_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES govcore.users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE,
  role            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  is_primary      boolean NOT NULL DEFAULT false,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_org_membership_unique
  ON govcore.user_organization_memberships (user_id, organization_id);

CREATE TABLE IF NOT EXISTS govcore.audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  user_id         uuid,
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  metadata        jsonb,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_org_idx ON govcore.audit_log (organization_id);
