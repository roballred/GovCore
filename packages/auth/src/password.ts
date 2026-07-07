// @govcore/auth/password — bcrypt hashing + a generic password policy validator.
// OWASP A07. No GovEA-specific per-org policy; the policy is a plain options bag.

import bcrypt from 'bcryptjs'

const DEFAULT_ROUNDS = 10

export async function hashPassword(plain: string, rounds = DEFAULT_ROUNDS): Promise<string> {
  return bcrypt.hash(plain, rounds)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export interface PasswordPolicy {
  minLength?: number
  requireUppercase?: boolean
  requireLowercase?: boolean
  requireDigit?: boolean
  requireSpecial?: boolean
}

export const FALLBACK_MIN_LENGTH = 8

export type PasswordValidationResult = { valid: true } | { valid: false; message: string }

/** Validate against an optional policy; min length is always enforced. */
export function validatePassword(
  password: string | null | undefined,
  policy?: PasswordPolicy | null,
): PasswordValidationResult {
  if (!password || password.trim() === '') {
    return { valid: false, message: 'Password is required' }
  }
  const minLength = policy?.minLength ?? FALLBACK_MIN_LENGTH
  if (password.length < minLength) {
    return { valid: false, message: `Password must be at least ${minLength} characters` }
  }
  if (policy?.requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must include at least one uppercase letter' }
  }
  if (policy?.requireLowercase && !/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must include at least one lowercase letter' }
  }
  if (policy?.requireDigit && !/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must include at least one digit' }
  }
  if (policy?.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, message: 'Password must include at least one special character' }
  }
  return { valid: true }
}

/**
 * The `organizations.metadata` key under which a per-org PasswordPolicy is
 * stored. GovCore models no security-settings column — `metadata` is the
 * documented extension point (formalizing org settings is tracked in #69), so a
 * consumer wanting per-org rules stashes a policy here and resolves it with
 * {@link passwordPolicyFromMetadata}.
 */
export const PASSWORD_POLICY_METADATA_KEY = 'passwordPolicy'

/**
 * Extract a {@link PasswordPolicy} from an org's `metadata` bag, or `undefined`
 * when absent or malformed (callers then fall back to FALLBACK_MIN_LENGTH via
 * {@link validatePassword}). Pure: only known policy fields carrying the right
 * primitive type are copied, so arbitrary values in the metadata bag can't
 * smuggle in unexpected rules.
 */
export function passwordPolicyFromMetadata(metadata: unknown): PasswordPolicy | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const raw = (metadata as Record<string, unknown>)[PASSWORD_POLICY_METADATA_KEY]
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const policy: PasswordPolicy = {}
  if (typeof r.minLength === 'number') policy.minLength = r.minLength
  if (typeof r.requireUppercase === 'boolean') policy.requireUppercase = r.requireUppercase
  if (typeof r.requireLowercase === 'boolean') policy.requireLowercase = r.requireLowercase
  if (typeof r.requireDigit === 'boolean') policy.requireDigit = r.requireDigit
  if (typeof r.requireSpecial === 'boolean') policy.requireSpecial = r.requireSpecial
  return Object.keys(policy).length > 0 ? policy : undefined
}
