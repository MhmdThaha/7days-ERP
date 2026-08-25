import { describe, expect, it } from 'vitest';

import {
  moduleDetailPath,
  moduleEditPath,
  moduleListPath,
  MODULE_LIST_PATHS,
  parseTransactionalWorkflowUrl,
} from '@/lib/navigation/module-workflow-navigation';

describe('module-workflow-navigation', () => {
  it('exposes list paths for all transactional modules', () => {
    expect(MODULE_LIST_PATHS.sales).toBe('/sales');
    expect(MODULE_LIST_PATHS.purchases).toBe('/purchases');
    expect(MODULE_LIST_PATHS.production).toBe('/production');
    expect(MODULE_LIST_PATHS.expenses).toBe('/expenses');
    expect(MODULE_LIST_PATHS.wastage).toBe('/wastage');
    expect(MODULE_LIST_PATHS.returns).toBe('/returns');
  });

  it('builds detail paths from module and id', () => {
    expect(moduleDetailPath('sales', 'abc123')).toBe('/sales/abc123');
    expect(moduleListPath('purchases')).toBe('/purchases');
    expect(moduleEditPath('purchases', '25')).toBe('/purchases/25/edit');
  });

  it('parses transactional workflow URLs with stable ids', () => {
    expect(parseTransactionalWorkflowUrl('/purchases/25/edit')).toEqual({
      module: 'purchases',
      url: '/purchases/25/edit',
    });
    expect(parseTransactionalWorkflowUrl('/returns/ret-1', '?saleId=ABC')).toEqual({
      module: 'returns',
      url: '/returns/ret-1?saleId=ABC',
    });
    expect(parseTransactionalWorkflowUrl('/purchases/new')).toBeNull();
    expect(parseTransactionalWorkflowUrl('/products/prod-1')).toBeNull();
  });
});
