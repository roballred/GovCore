---
"@govcore/auth": minor
"@govcore/setup": patch
---

auth: stop shipping a global `next-auth` augmentation; the consumer owns its session/role types (#108).

`@govcore/auth`'s entry side-effect-imported a `declare module 'next-auth'` that stamped `session.user.role: string` (and a `@auth/core/jwt` `role?: string`) onto **every** consumer's compilation. A consumer that types `role` as its own union (not bare `string`) got its session augmentation overridden — `session.user.role` resolved to `string` and every typed-role call site failed. Worse, `@govcore/setup` imported `@govcore/auth` for a single type, so an app that only wanted `provisionRuntimeRole` inherited the augmentation too.

- **`@govcore/auth`** no longer imports `./types` from its entry. `createAuth`'s callbacks type the claims they stamp via a **local** cast, so the package compiles without globally augmenting anyone. The augmentation is now an **opt-in** subpath: a single-role app that wants a ready-made session shape does `import '@govcore/auth/next-auth'`; an app with its own role type declares its own `next-auth` augmentation and skips it. No runtime change.
- **`@govcore/setup`** imports `PasswordPolicy`/`hashPassword`/`validatePassword` from the leaf `@govcore/auth/password` instead of the package entry, so it no longer drags the augmentation.
- **`examples/minimal-app`** now declares its own `next-auth` augmentation typing `role` as its `'admin' | 'member' | 'viewer'` union — the canary proves a typed-role consumer compiles against `createAuth`.

**Migration:** a consumer relying on the old implicit `session.user.role: string` either adds `import '@govcore/auth/next-auth'` once (side-effect) or declares its own `next-auth` module augmentation (recommended — lets you type `role` as your role union).
