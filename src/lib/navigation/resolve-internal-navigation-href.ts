export function isInternalNavigationHref(href: string): boolean {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false;
  }

  if (href.startsWith('http://') || href.startsWith('https://')) {
    return false;
  }

  return href.startsWith('/');
}

export function isSamePageHref(href: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const current = `${window.location.pathname}${window.location.search}`;
  return href === current || href === window.location.pathname;
}

function hrefFromAnchor(element: Element): string | null {
  if (!(element instanceof HTMLAnchorElement)) {
    return null;
  }

  const href = element.getAttribute('href');

  if (!href || !isInternalNavigationHref(href) || isSamePageHref(href)) {
    return null;
  }

  return href;
}

/** Resolve an internal navigation href from a click target, including composed sidebar controls. */
export function resolveInternalNavigationHrefFromTarget(target: Element): string | null {
  const directAnchor = target.closest('a[href]');

  if (directAnchor) {
    const href = hrefFromAnchor(directAnchor);
    if (href) {
      return href;
    }
  }

  const composedRoot = target.closest(
    '[data-slot="sidebar-menu-button"], [data-slot="tooltip-trigger"]',
  );

  if (composedRoot) {
    const nestedAnchor = composedRoot.querySelector('a[href]');

    if (nestedAnchor) {
      const href = hrefFromAnchor(nestedAnchor);
      if (href) {
        return href;
      }
    }
  }

  return null;
}
