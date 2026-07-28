import { describe, expect, it } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import { LEAST_PRIVILEGE_ROLE, parseUserRole, requireUserRole, USER_ROLES } from '@/lib/auth/user-role';

describe('parseUserRole', () => {
  it.each(USER_ROLES)('accepts valid role "%s"', (role) => {
    expect(parseUserRole(role)).toBe(role);
  });

  it('trims whitespace around valid roles', () => {
    expect(parseUserRole('  manager  ')).toBe('manager');
  });

  it('returns null for missing role', () => {
    expect(parseUserRole(undefined)).toBeNull();
    expect(parseUserRole(null)).toBeNull();
  });

  it('returns null for empty role', () => {
    expect(parseUserRole('')).toBeNull();
    expect(parseUserRole('   ')).toBeNull();
  });

  it('returns null for invalid role', () => {
    expect(parseUserRole('admin')).toBeNull();
    expect(parseUserRole('own er')).toBeNull();
    expect(parseUserRole('OWNER')).toBeNull();
    expect(parseUserRole(42)).toBeNull();
  });

  it('never defaults to owner', () => {
    expect(parseUserRole(undefined)).not.toBe('owner');
    expect(parseUserRole('invalid')).not.toBe('owner');
  });
});

describe('requireUserRole', () => {
  it('returns valid roles unchanged', () => {
    expect(requireUserRole('sales')).toBe('sales');
    expect(requireUserRole('owner')).toBe('owner');
  });

  it('throws INVALID_ROLE for missing role', () => {
    expect(() => requireUserRole(undefined)).toThrow(DomainError);
    expect(() => requireUserRole(undefined)).toThrow(
      expect.objectContaining({ code: 'INVALID_ROLE' }),
    );
  });

  it('throws INVALID_ROLE for invalid role', () => {
    expect(() => requireUserRole('superadmin')).toThrow(DomainError);
    expect(() => requireUserRole('superadmin')).toThrow(
      expect.objectContaining({ code: 'INVALID_ROLE' }),
    );
  });

  it('never escalates to owner on invalid input', () => {
    try {
      requireUserRole(null);
      expect.fail('expected requireUserRole to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_ROLE');
    }
  });
});

describe('LEAST_PRIVILEGE_ROLE', () => {
  it('is store and is not used as an implicit auth default', () => {
    expect(LEAST_PRIVILEGE_ROLE).toBe('store');
    expect(parseUserRole(undefined)).not.toBe(LEAST_PRIVILEGE_ROLE);
  });
});
