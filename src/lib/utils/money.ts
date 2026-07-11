const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(minorUnits: number): string {
  return INR_FORMATTER.format(minorUnits / 100);
}

export function parseMoneyInput(value: string): number | null {
  const normalized = value.replace(/[^0-9.]/g, '');

  if (!normalized || normalized === '.') {
    return null;
  }

  const amount = Number.parseFloat(normalized);

  if (Number.isNaN(amount)) {
    return null;
  }

  return Math.round(amount * 100);
}

export function minorUnitsToDisplayValue(minorUnits: number): string {
  if (minorUnits <= 0) {
    return '';
  }

  return (minorUnits / 100).toFixed(2);
}

export function sanitizeMoneyText(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, '');

  const dotIndex = cleaned.indexOf('.');

  if (dotIndex !== -1) {
    const intPart = cleaned.slice(0, dotIndex);
    const decPart = cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
    cleaned = decPart.length > 0 ? `${intPart}.${decPart}` : `${intPart}.`;
  }

  return cleaned;
}

export function formatMoneyInputDisplay(value: string): string {
  if (!value) {
    return '';
  }

  const [intPart = '', decPart] = value.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (decPart !== undefined) {
    return `${withCommas}.${decPart}`;
  }

  return withCommas;
}
