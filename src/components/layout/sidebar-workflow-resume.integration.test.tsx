// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarNavItem } from '@/components/layout/sidebar-nav-item';
import type { NavItemConfig } from '@/components/layout/nav-items';
import { SidebarProvider } from '@/components/ui/sidebar';
import {
  clearModuleWorkflowOnExit,
  clearModuleWorkflowResumeForRecord,
  recordTransactionalWorkflowUrl,
  setModuleWorkflowResume,
} from '@/lib/navigation/module-workflow-resume';

vi.mock('next/navigation', () => ({
  usePathname: () => '/products',
}));

const purchasesNavItem: NavItemConfig = {
  href: '/purchases',
  label: 'Purchases',
  icon: 'ShoppingCart',
  module: 'purchases',
  roles: ['owner'],
};

const productionNavItem: NavItemConfig = {
  href: '/production',
  label: 'Production',
  icon: 'Factory',
  module: 'production',
  roles: ['owner'],
};

function renderSidebarItem(item: NavItemConfig, pathname: string) {
  return render(
    <SidebarProvider>
      <SidebarNavItem item={item} pathname={pathname} />
    </SidebarProvider>,
  );
}

function mockMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('Sidebar workflow resume navigation', () => {
  beforeEach(() => {
    mockMatchMedia();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it('uses the module list when no bookmark exists', () => {
    renderSidebarItem(purchasesNavItem, '/products');

    expect(screen.getByRole('link', { name: 'Purchases' }).getAttribute('href')).toBe('/purchases');
  });

  it('resumes the remembered workflow when a bookmark exists', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');

    renderSidebarItem(purchasesNavItem, '/products');

    expect(screen.getByRole('link', { name: 'Purchases' }).getAttribute('href')).toBe(
      '/purchases/25/edit',
    );
  });

  it('keeps independent bookmarks across modules', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');
    setModuleWorkflowResume('production', '/production/12/edit');

    const { rerender } = renderSidebarItem(purchasesNavItem, '/products');
    expect(screen.getByRole('link', { name: 'Purchases' }).getAttribute('href')).toBe(
      '/purchases/25/edit',
    );

    rerender(
      <SidebarProvider>
        <SidebarNavItem item={productionNavItem} pathname="/products" />
      </SidebarProvider>,
    );
    expect(screen.getByRole('link', { name: 'Production' }).getAttribute('href')).toBe(
      '/production/12/edit',
    );
  });

  it('returns to the module list after explicit exit clears the bookmark', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');
    clearModuleWorkflowOnExit('purchases');

    renderSidebarItem(purchasesNavItem, '/purchases');

    expect(screen.getByRole('link', { name: 'Purchases' }).getAttribute('href')).toBe('/purchases');
  });

  it('clears only the matching record bookmark from list actions', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');
    clearModuleWorkflowResumeForRecord('purchases', '25');

    renderSidebarItem(purchasesNavItem, '/products');

    expect(screen.getByRole('link', { name: 'Purchases' }).getAttribute('href')).toBe('/purchases');
  });

  it('does not clear another module bookmark when visiting a different module', () => {
    setModuleWorkflowResume('purchases', '/purchases/25/edit');

    renderSidebarItem(productionNavItem, '/production/12/edit');

    expect(getPurchasesBookmark()).toBe('/purchases/25/edit');
  });

  it('updates bookmark after save-draft style navigation is recorded', () => {
    recordTransactionalWorkflowUrl('/purchases/25');

    renderSidebarItem(purchasesNavItem, '/products');

    expect(screen.getByRole('link', { name: 'Purchases' }).getAttribute('href')).toBe('/purchases/25');
  });
});

function getPurchasesBookmark(): string | null {
  const raw = window.sessionStorage.getItem('bakeryos-module-workflow-resume');

  if (!raw) {
    return null;
  }

  return (JSON.parse(raw) as { purchases?: string }).purchases ?? null;
}
