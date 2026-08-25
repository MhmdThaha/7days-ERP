// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { resolveInternalNavigationHrefFromTarget } from '@/lib/navigation/resolve-internal-navigation-href';

describe('resolveInternalNavigationHrefFromTarget', () => {
  it('resolves href from a plain internal link', () => {
    document.body.innerHTML = '<a href="/products">Products</a>';
    const link = document.querySelector('a')!;

    expect(resolveInternalNavigationHrefFromTarget(link)).toBe('/products');
  });

  it('resolves href from a sidebar menu button wrapping a link', () => {
    document.body.innerHTML = `
      <div data-slot="sidebar-menu-button">
        <a href="/products"><span>Products</span></a>
      </div>
    `;
    const label = document.querySelector('span')!;

    expect(resolveInternalNavigationHrefFromTarget(label)).toBe('/products');
  });

  it('resolves href from a tooltip trigger wrapping a sidebar link', () => {
    document.body.innerHTML = `
      <div data-slot="tooltip-trigger" data-slot="sidebar-menu-button">
        <a href="/products"><span>Products</span></a>
      </div>
    `;
    const label = document.querySelector('span')!;

    expect(resolveInternalNavigationHrefFromTarget(label)).toBe('/products');
  });

  it('ignores same-page hrefs', () => {
    window.history.pushState({}, '', '/purchases/purchase-1/edit');
    document.body.innerHTML = '<a href="/purchases/purchase-1/edit">Current</a>';
    const link = document.querySelector('a')!;

    expect(resolveInternalNavigationHrefFromTarget(link)).toBeNull();
  });
});
