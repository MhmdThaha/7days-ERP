import type { MemberRole } from '@/components/layout/nav-items';

import { DomainError } from '@/lib/domain/errors';

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'complete';
export type PermissionResource =
  | 'product'
  | 'rawMaterial'
  | 'recipe'
  | 'purchase'
  | 'production'
  | 'sales'
  | 'expense'
  | 'wastage'
  | 'return'
  | 'inventory'
  | 'dailySummary'
  | 'monthlySummary'
  | 'reports'
  | 'settings'
  | 'import';

type PermissionMatrix = Record<
  PermissionResource,
  Partial<Record<PermissionAction, readonly MemberRole[]>>
>;

const managementRoles = ['owner', 'manager'] as const satisfies readonly MemberRole[];
const allRoles = ['owner', 'manager', 'production', 'sales', 'store'] as const satisfies readonly MemberRole[];

const PERMISSIONS: PermissionMatrix = {
  product: {
    create: managementRoles,
    read: allRoles,
    update: managementRoles,
    delete: managementRoles,
  },
  rawMaterial: {
    create: managementRoles,
    read: [...managementRoles, 'production'],
    update: managementRoles,
    delete: managementRoles,
  },
  recipe: {
    create: managementRoles,
    read: [...managementRoles, 'production'],
    update: managementRoles,
    delete: managementRoles,
  },
  purchase: {
    create: managementRoles,
    read: managementRoles,
    update: managementRoles,
    delete: managementRoles,
    complete: managementRoles,
  },
  production: {
    create: [...managementRoles, 'production'],
    read: allRoles,
    update: [...managementRoles, 'production'],
    delete: [...managementRoles, 'production'],
    complete: [...managementRoles, 'production'],
  },
  sales: {
    create: allRoles,
    read: allRoles,
    update: allRoles,
    delete: allRoles,
    complete: allRoles,
  },
  expense: {
    create: managementRoles,
    read: managementRoles,
    update: managementRoles,
    delete: managementRoles,
    complete: managementRoles,
  },
  wastage: {
    create: [...managementRoles, 'production', 'store'],
    read: allRoles,
    update: [...managementRoles, 'production', 'store'],
    delete: [...managementRoles, 'production', 'store'],
    complete: [...managementRoles, 'production', 'store'],
  },
  return: {
    create: allRoles,
    read: allRoles,
    update: allRoles,
    delete: allRoles,
    complete: allRoles,
  },
  inventory: {
    read: allRoles,
    create: managementRoles,
    complete: managementRoles,
  },
  dailySummary: {
    read: managementRoles,
  },
  monthlySummary: {
    read: managementRoles,
  },
  reports: {
    read: managementRoles,
  },
  settings: {
    read: managementRoles,
    update: ['owner'],
  },
  import: {
    create: managementRoles,
    read: managementRoles,
  },
};

export function can(
  role: MemberRole,
  action: PermissionAction,
  resource: PermissionResource,
): boolean {
  const allowedRoles = PERMISSIONS[resource][action];

  if (!allowedRoles) {
    return false;
  }

  return allowedRoles.includes(role);
}

export function assertCan(
  role: MemberRole,
  action: PermissionAction,
  resource: PermissionResource,
): void {
  if (!can(role, action, resource)) {
    throw new DomainError('UNAUTHORIZED', 'You do not have permission to perform this action.');
  }
}
