import { DomainError } from '@/lib/domain/errors';
import type { UserRole } from '@/types/user';

export const USER_ROLES = [
  'owner',
  'manager',
  'production',
  'sales',
  'store',
] as const satisfies readonly UserRole[];

/** Lowest-privilege role — never used as an auth fallback; documented for RBAC ordering. */
export const LEAST_PRIVILEGE_ROLE: UserRole = 'store';

const USER_ROLE_SET = new Set<string>(USER_ROLES);

/**
 * Returns a validated role, or null when the value is missing or not a known role.
 * Never defaults to owner.
 */
export function parseUserRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!USER_ROLE_SET.has(trimmed)) {
    return null;
  }

  return trimmed as UserRole;
}

/**
 * Returns a validated role for authenticated requests.
 * Denies access when the role is missing or invalid — never escalates to owner.
 */
export function requireUserRole(value: unknown): UserRole {
  const role = parseUserRole(value);

  if (role === null) {
    throw new DomainError(
      'INVALID_ROLE',
      'Your account role is missing or invalid. Contact your bakery owner.',
    );
  }

  return role;
}
