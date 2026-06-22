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
