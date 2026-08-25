/** Module list routes - destination after Complete / Receive / Cancel (create and edit). */
export const MODULE_LIST_PATHS = {
  sales: '/sales',
  purchases: '/purchases',
  production: '/production',
  expenses: '/expenses',
  wastage: '/wastage',
  returns: '/returns',
} as const;

export type TransactionalModule = keyof typeof MODULE_LIST_PATHS;

export const TRANSACTIONAL_MODULES = Object.keys(MODULE_LIST_PATHS) as TransactionalModule[];

export function moduleListPath(module: TransactionalModule): string {
  return MODULE_LIST_PATHS[module];
}

export function moduleDetailPath(module: TransactionalModule, id: string): string {
  return `${MODULE_LIST_PATHS[module]}/${id}`;
}

export function moduleEditPath(module: TransactionalModule, id: string): string {
  return `${MODULE_LIST_PATHS[module]}/${id}/edit`;
}

export function isTransactionalNavModule(module: string): module is TransactionalModule {
  return (TRANSACTIONAL_MODULES as readonly string[]).includes(module);
}

export type ParsedTransactionalWorkflow = {
  module: TransactionalModule;
  url: string;
};

/** Returns a remembered workflow URL for detail/edit routes with a stable record id. */
export function parseTransactionalWorkflowUrl(
  pathname: string,
  search = '',
): ParsedTransactionalWorkflow | null {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const [moduleSegment, idSegment, ...rest] = segments;

  if (!moduleSegment || !isTransactionalNavModule(moduleSegment)) {
    return null;
  }

  if (idSegment === 'new' || !idSegment) {
    return null;
  }

  const isEditRoute = rest.length === 1 && rest[0] === 'edit';

  if (rest.length > 0 && !isEditRoute) {
    return null;
  }

  const url = `${pathname}${search}`;

  return {
    module: moduleSegment,
    url,
  };
}
