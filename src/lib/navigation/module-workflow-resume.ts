import {
  isTransactionalNavModule,
  moduleListPath,
  parseTransactionalWorkflowUrl,
  type TransactionalModule,
} from '@/lib/navigation/module-workflow-navigation';

export const MODULE_WORKFLOW_RESUME_STORAGE_KEY = 'bakeryos-module-workflow-resume';

export const MODULE_WORKFLOW_RESUME_CHANGED_EVENT = 'bakeryos-module-workflow-resume-changed';

export type ModuleWorkflowResumeMap = Partial<Record<TransactionalModule, string>>;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function notifyWorkflowResumeChanged(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(MODULE_WORKFLOW_RESUME_CHANGED_EVENT));
}

function readStorageMap(): ModuleWorkflowResumeMap {
  if (!isBrowser()) {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(MODULE_WORKFLOW_RESUME_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const result: ModuleWorkflowResumeMap = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (isTransactionalNavModule(key) && typeof value === 'string' && value.startsWith('/')) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function writeStorageMap(map: ModuleWorkflowResumeMap): void {
  if (!isBrowser()) {
    return;
  }

  if (Object.keys(map).length === 0) {
    window.sessionStorage.removeItem(MODULE_WORKFLOW_RESUME_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(MODULE_WORKFLOW_RESUME_STORAGE_KEY, JSON.stringify(map));
  }

  notifyWorkflowResumeChanged();
}

export function getModuleWorkflowResumeMap(): ModuleWorkflowResumeMap {
  return readStorageMap();
}

export function getModuleWorkflowResume(module: TransactionalModule): string | null {
  return readStorageMap()[module] ?? null;
}

export function setModuleWorkflowResume(module: TransactionalModule, url: string): void {
  const map = readStorageMap();
  map[module] = url;
  writeStorageMap(map);
}

export function clearModuleWorkflowResume(module: TransactionalModule): void {
  const map = readStorageMap();

  if (!(module in map)) {
    return;
  }

  delete map[module];
  writeStorageMap(map);
}

export function clearAllModuleWorkflowResumes(): void {
  writeStorageMap({});
}

export function recordTransactionalWorkflowUrl(pathname: string, search = ''): void {
  const parsed = parseTransactionalWorkflowUrl(pathname, search);

  if (!parsed) {
    return;
  }

  setModuleWorkflowResume(parsed.module, parsed.url);
}

export function resolveTransactionalSidebarHref(
  navModule: string,
  defaultListHref: string,
): string {
  if (!isTransactionalNavModule(navModule)) {
    return defaultListHref;
  }

  return getModuleWorkflowResume(navModule) ?? defaultListHref;
}

export function clearModuleWorkflowOnExit(module: TransactionalModule): void {
  clearModuleWorkflowResume(module);
}

/** Clears the bookmark when a specific record workflow was explicitly ended. */
export function clearModuleWorkflowResumeForRecord(
  module: TransactionalModule,
  recordId: string,
): void {
  const current = getModuleWorkflowResume(module);

  if (!current) {
    return;
  }

  if (current.includes(`/${recordId}`) || current.includes(`/${recordId}/`)) {
    clearModuleWorkflowResume(module);
  }
}
