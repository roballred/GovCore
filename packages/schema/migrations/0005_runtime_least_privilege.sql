-- 0005_runtime_least_privilege — document the runtime GRANT matrix (#152).
--
-- Grants themselves are applied by `@govcore/setup` `provisionRuntimeRole`
-- (the runtime role name is app-configured via GOVCORE_APP_ROLE), not by
-- govcore-migrate. Re-run `provisionRuntimeRole` / `govcore-setup` after
-- upgrading so existing instances pick up the REVOKEs.
--
-- Matrix (non-owner runtime role):
--   SELECT              organizations
--   SELECT,INSERT,UPDATE,DELETE  users, user_organization_memberships,
--                       org_connections, cross_org_links
--   SELECT,INSERT       audit_log
--   NONE                accounts, sessions, verification_tokens,
--                       break_glass_sessions, act_as_sessions,
--                       instance_settings, platform_config,
--                       __govcore_migrations
--
-- Auth.js adapter tables → authDb. Support / operator / config → operatorDb.
-- Content schema (non-govcore) keeps full DML + default privileges; those
-- tables are FORCE-RLS'd by the content engine.

COMMENT ON TABLE govcore.organizations IS
  'Tenant root. Not under org-GUC RLS. Runtime role: SELECT only (#152); writes via operator/setup.';

COMMENT ON TABLE govcore.accounts IS
  'Auth.js adapter. Not under RLS. Runtime role: no grants — authDb only (#152).';

COMMENT ON TABLE govcore.sessions IS
  'Auth.js adapter. Not under RLS. Runtime role: no grants — authDb only (#152).';

COMMENT ON TABLE govcore.verification_tokens IS
  'Auth.js adapter. Not under RLS. Runtime role: no grants — authDb only (#152).';

COMMENT ON TABLE govcore.break_glass_sessions IS
  'Support access. Not under RLS. Runtime role: no grants — operatorDb only (#152).';

COMMENT ON TABLE govcore.act_as_sessions IS
  'Support access. Not under RLS. Runtime role: no grants — operatorDb only (#152).';

COMMENT ON TABLE govcore.instance_settings IS
  'Instance singleton. Not under RLS. Runtime role: no grants — operatorDb only (#152).';

COMMENT ON TABLE govcore.platform_config IS
  'Platform singleton. Not under RLS. Runtime role: no grants — operatorDb only (#152).';
