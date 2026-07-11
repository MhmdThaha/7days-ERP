import { Timestamp } from 'firebase-admin/firestore';

export function timestampToDate(value: Timestamp | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return value.toDate();
}

export function dateToTimestamp(value: Date): Timestamp {
  return Timestamp.fromDate(value);
}

export function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
