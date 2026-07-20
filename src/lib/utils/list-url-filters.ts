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
