// Pure SQL-identifier validation, kept in its own module (no heavy imports) so
// it is unit-testable without loading the DB/auth stack.

/** SQL identifiers (role, schema) are interpolated into DDL, so validate them. */
const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/i

/** Throw unless `name` is a safe SQL identifier (letters/digits/underscore, not digit-leading). */
export function assertSafeIdentifier(name: string, kind: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Unsafe ${kind} identifier ${JSON.stringify(name)} — expected /^[A-Za-z_][A-Za-z0-9_]*$/`)
  }
}
