const STORAGE_KEY = 'bakeryos-recent-form-values';
const MAX_ENTRIES = 8;
const MAX_RECENT_MATERIALS = 10;
const MAX_FREQUENT_MATERIALS = 10;

type MaterialUsage = {
  id: string;
  count: number;
  lastUsedAt: number;
};

type RecentFormValues = {
  suppliers: string[];
  customers: string[];
  materials: MaterialUsage[];
};

function readStorage(): RecentFormValues {
  if (typeof window === 'undefined') {
    return { suppliers: [], customers: [], materials: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { suppliers: [], customers: [], materials: [] };
    }

    const parsed = JSON.parse(raw) as Partial<RecentFormValues>;

    return {
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      materials: Array.isArray(parsed.materials)
        ? parsed.materials.filter(
            (entry): entry is MaterialUsage =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof entry.id === 'string' &&
              typeof entry.count === 'number' &&
              typeof entry.lastUsedAt === 'number',
          )
        : [],
    };
  } catch {
    return { suppliers: [], customers: [], materials: [] };
  }
}

function writeStorage(values: RecentFormValues): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

function rememberValue(existing: string[], value: string): string[] {
  const trimmed = value.trim();

  if (!trimmed) {
    return existing;
  }

  const next = [trimmed, ...existing.filter((entry) => entry !== trimmed)];
  return next.slice(0, MAX_ENTRIES);
}

export function getRecentSuppliers(): string[] {
  return readStorage().suppliers;
}

export function getRecentCustomers(): string[] {
  return readStorage().customers;
}

export function rememberSupplier(value: string): void {
  const current = readStorage();
  writeStorage({
    ...current,
    suppliers: rememberValue(current.suppliers, value),
  });
}

export function rememberCustomer(value: string): void {
  const current = readStorage();
  writeStorage({
    ...current,
    customers: rememberValue(current.customers, value),
  });
}

/** Records a raw material selection for recent/frequent picker sections. */
export function rememberRawMaterial(materialId: string): void {
  const trimmed = materialId.trim();

  if (!trimmed) {
    return;
  }

  const current = readStorage();
  const now = Date.now();
  const existing = current.materials.find((entry) => entry.id === trimmed);
  const nextEntry: MaterialUsage = existing
    ? { id: trimmed, count: existing.count + 1, lastUsedAt: now }
    : { id: trimmed, count: 1, lastUsedAt: now };

  const materials = [
    nextEntry,
    ...current.materials.filter((entry) => entry.id !== trimmed),
  ].slice(0, 50);

  writeStorage({ ...current, materials });
}

/** Most recently used materials, newest first. */
export function getRecentRawMaterialIds(): string[] {
  return [...readStorage().materials]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_RECENT_MATERIALS)
    .map((entry) => entry.id);
}

/** Most frequently used materials, excluding IDs already shown as recent. */
export function getFrequentRawMaterialIds(): string[] {
  const recentIds = new Set(getRecentRawMaterialIds());

  return [...readStorage().materials]
    .filter((entry) => !recentIds.has(entry.id))
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_FREQUENT_MATERIALS)
    .map((entry) => entry.id);
}
