const STORAGE_KEY = 'bakeryos-recent-form-values';
const MAX_ENTRIES = 8;

type RecentFormValues = {
  suppliers: string[];
  customers: string[];
};

function readStorage(): RecentFormValues {
  if (typeof window === 'undefined') {
    return { suppliers: [], customers: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { suppliers: [], customers: [] };
    }

    const parsed = JSON.parse(raw) as Partial<RecentFormValues>;

    return {
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    };
  } catch {
    return { suppliers: [], customers: [] };
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
