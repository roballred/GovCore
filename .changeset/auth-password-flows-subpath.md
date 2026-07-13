---
'@govcore/auth': minor
---

Expose `changePassword` / `adminResetPassword` (+ `PasswordPolicy`) via a new **import-light `@govcore/auth/password-flows` subpath**. The flows themselves never touched `next-auth`, but living only on the main entry meant importing them pulled `createAuth` → `next-auth` → `next/server`, breaking consumers' vitest suites (node env). Import from `@govcore/auth/password-flows` to get the flows without that graph. The main `.` entry still re-exports them (non-breaking).
