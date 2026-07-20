export function getMonthKeyFromDateString(date: string): string {
  return date.slice(0, 7);
}

export function isDateInMonth(date: string, monthKey: string): boolean {
  return date.startsWith(`${monthKey}-`);
}

export function getDaysInMonth(monthKey: string): string[] {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!year || !month) {
    return [];
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `${monthKey}-${day}`;
  });
}

export function formatMonthLabel(monthKey: string): string {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!year || !month) {
    return monthKey;
  }

  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export function getDayOfMonth(date: string): number {
  return Number(date.split('-')[2] ?? '0');
}

export function getPreviousMonthKey(monthKey: string): string {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!year || !month) {
    return monthKey;
  }

  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - 1);

  const previousYear = date.getFullYear();
  const previousMonth = String(date.getMonth() + 1).padStart(2, '0');

  return `${previousYear}-${previousMonth}`;
}
