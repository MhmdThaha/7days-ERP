// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MODULE_WORKFLOW_RESUME_STORAGE_KEY,
  clearAllModuleWorkflowResumes,
  clearModuleWorkflowOnExit,
  clearModuleWorkflowResume,
  clearModuleWorkflowResumeForRecord,
  getModuleWorkflowResume,
  getModuleWorkflowResumeMap,
  recordTransactionalWorkflowUrl,
  resolveTransactionalSidebarHref,
  setModuleWorkflowResume,
} from '@/lib/navigation/module-workflow-resume';

describe('module-workflow-resume', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('sets and gets a module bookmark', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');

    expect(getModuleWorkflowResume('purchases')).toBe('/purchases/25/edit');
  });

  it('updates an existing module bookmark', () => {
    setModuleWorkflowResume('purchases', '/purchases/25');
    setModuleWorkflowResume('purchases', '/purchases/25/edit');

    expect(getModuleWorkflowResume('purchases')).toBe('/purchases/25/edit');
  });

  it('clears a module bookmark', () => {
    setModuleWorkflowResume('sales', '/sales/40');
    clearModuleWorkflowResume('sales');

    expect(getModuleWorkflowResume('sales')).toBeNull();
  });

  it('returns null when a bookmark is missing', () => {
    expect(getModuleWorkflowResume('production')).toBeNull();
  });

  it('preserves full path and query string', () => {
    setModuleWorkflowResume('returns', '/returns/new?saleId=ABC');

    expect(getModuleWorkflowResume('returns')).toBe('/returns/new?saleId=ABC');
  });

  it('keeps independent bookmarks per module', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');
    setModuleWorkflowResume('production', '/production/12/edit');
    setModuleWorkflowResume('sales', '/sales/40');

    expect(getModuleWorkflowResumeMap()).toEqual({
      purchases: '/purchases/25/edit',
      production: '/production/12/edit',
      sales: '/sales/40',
    });
  });

  it('does not overwrite another module when updating one module', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');
    setModuleWorkflowResume('production', '/production/12/edit');

    setModuleWorkflowResume('purchases', '/purchases/25');

    expect(getModuleWorkflowResume('purchases')).toBe('/purchases/25');
    expect(getModuleWorkflowResume('production')).toBe('/production/12/edit');
  });

  it('records detail and edit workflow URLs from the current path', () => {
    recordTransactionalWorkflowUrl('/purchases/25/edit');

    expect(getModuleWorkflowResume('purchases')).toBe('/purchases/25/edit');
  });

  it('does not record module list or new routes', () => {
    recordTransactionalWorkflowUrl('/purchases');
    recordTransactionalWorkflowUrl('/purchases/new');

    expect(getModuleWorkflowResume('purchases')).toBeNull();
  });

  it('resolves sidebar href to bookmark when present', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');

    expect(resolveTransactionalSidebarHref('purchases', '/purchases')).toBe('/purchases/25/edit');
  });

  it('falls back to list href for reference modules', () => {
    expect(resolveTransactionalSidebarHref('products', '/products')).toBe('/products');
  });

  it('clears bookmark on explicit module exit', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');
    clearModuleWorkflowOnExit('purchases');

    expect(getModuleWorkflowResume('purchases')).toBeNull();
  });

  it('clears bookmark only when record id matches', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');

    clearModuleWorkflowResumeForRecord('purchases', '99');

    expect(getModuleWorkflowResume('purchases')).toBe('/purchases/25/edit');

    clearModuleWorkflowResumeForRecord('purchases', '25');

    expect(getModuleWorkflowResume('purchases')).toBeNull();
  });

  it('persists bookmarks in sessionStorage', () => {
    setModuleWorkflowResume('expenses', '/expenses/7/edit');

    const raw = window.sessionStorage.getItem(MODULE_WORKFLOW_RESUME_STORAGE_KEY);

    expect(raw).toContain('/expenses/7/edit');
  });

  it('clears all bookmarks', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');
    setModuleWorkflowResume('sales', '/sales/40');
    clearAllModuleWorkflowResumes();

    expect(getModuleWorkflowResumeMap()).toEqual({});
  });
});
