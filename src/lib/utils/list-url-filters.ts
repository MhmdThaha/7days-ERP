import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';

export function parseStatusFilter<T extends string>(
  value: string | null | undefined,
  allowedValues: readonly T[],
  defaultValue: T,
): T {
  if (value && (allowedValues as readonly string[]).includes(value)) {
    return value as T;
  }

  return defaultValue;
}

export function useStatusFilterFromSearchParams<T extends string>(
  searchParams: ReadonlyURLSearchParams,
  allowedValues: readonly T[],
  defaultValue: T,
  onChange?: () => void,
): [T, Dispatch<SetStateAction<T>>] {
  const statusParam = searchParams.get('status');
  const [status, setStatus] = useState<T>(() =>
    parseStatusFilter(statusParam, allowedValues, defaultValue),
  );

  useEffect(() => {
    const nextStatus = parseStatusFilter(statusParam, allowedValues, defaultValue);

    setStatus((current) => {
      if (current !== nextStatus) {
        onChange?.();
      }

      return nextStatus;
    });
  }, [statusParam, defaultValue, onChange]);

  return [status, setStatus];
}
