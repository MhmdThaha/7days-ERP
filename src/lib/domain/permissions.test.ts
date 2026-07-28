import { describe, expect, it } from 'vitest';

import type { MemberRole } from '@/components/layout/nav-items';
import { DomainError } from '@/lib/domain/errors';
import { assertCan, can } from '@/lib/domain/permissions';

describe('RBAC permissions matrix', () => {
  it('grants owner full management access', () => {
    expect(can('owner', 'create', 'product')).toBe(true);
    expect(can('owner', 'delete', 'purchase')).toBe(true);
    expect(can('owner', 'read', 'reports')).toBe(true);
    expect(can('owner', 'update', 'settings')).toBe(true);
  });

  it('grants manager allowed permissions but not owner-only settings updates', () => {
    expect(can('manager', 'create', 'product')).toBe(true);
    expect(can('manager', 'read', 'reports')).toBe(true);
    expect(can('manager', 'read', 'settings')).toBe(true);
    expect(can('manager', 'update', 'settings')).toBe(false);
  });

  it('denies sales access to reports', () => {
    expect(can('sales', 'read', 'reports')).toBe(false);
    expect(can('sales', 'read', 'monthlySummary')).toBe(false);
    expect(can('sales', 'read', 'dailySummary')).toBe(false);
  });

  it('denies sales access to purchases and expenses', () => {
    expect(can('sales', 'read', 'purchase')).toBe(false);
    expect(can('sales', 'create', 'purchase')).toBe(false);
    expect(can('sales', 'read', 'expense')).toBe(false);
  });

  it('allows sales to manage sales records', () => {
    expect(can('sales', 'create', 'sales')).toBe(true);
    expect(can('sales', 'complete', 'sales')).toBe(true);
  });

  it('allows production staff to manage production but not purchases', () => {
    expect(can('production', 'create', 'production')).toBe(true);
    expect(can('production', 'read', 'recipe')).toBe(true);
    expect(can('production', 'read', 'purchase')).toBe(false);
    expect(can('production', 'create', 'purchase')).toBe(false);
  });

  it('denies production staff settings updates (no user management actions exist)', () => {
    expect(can('production', 'update', 'settings')).toBe(false);
    expect(can('production', 'read', 'settings')).toBe(false);
  });

  it('allows store staff wastage but denies purchases and reports', () => {
    expect(can('store', 'create', 'wastage')).toBe(true);
    expect(can('store', 'read', 'purchase')).toBe(false);
    expect(can('store', 'read', 'reports')).toBe(false);
    expect(can('store', 'create', 'product')).toBe(false);
  });

  it('assertCan throws UNAUTHORIZED for disallowed actions', () => {
    expect(() => assertCan('sales', 'read', 'reports')).toThrow(DomainError);
    expect(() => assertCan('sales', 'read', 'reports')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });
});

describe('RBAC role coverage', () => {
  const roles: MemberRole[] = ['owner', 'manager', 'production', 'sales', 'store'];

  it.each(roles)('recognizes role "%s" in at least one permission', (role) => {
    const allowed =
      can(role, 'read', 'sales') ||
      can(role, 'read', 'product') ||
      can(role, 'read', 'inventory');

    expect(allowed).toBe(true);
  });
});
