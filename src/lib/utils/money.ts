const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(minorUnits: number): string {
  return INR_FORMATTER.format(minorUnits / 100);
}

export function parseMoneyInput(value: string, allowNegative = false): number | null {
  const negative = allowNegative && value.trim().startsWith('-');
  const normalized = value.replace(/[^0-9.]/g, '');

  if (!normalized || normalized === '.') {
    return null;
  }

  const amount = Number.parseFloat(normalized);

  if (Number.isNaN(amount)) {
    return null;
  }

  const minorUnits = Math.round(amount * 100);
  return negative ? -minorUnits : minorUnits;
}

export function minorUnitsToDisplayValue(minorUnits: number, allowNegative = false): string {
  if (minorUnits === 0) {
    return '';
  }

  if (minorUnits < 0) {
    if (!allowNegative) {
      return '';
    }

    return `-${(Math.abs(minorUnits) / 100).toFixed(2)}`;
  }

  return (minorUnits / 100).toFixed(2);
}

export function sanitizeMoneyText(raw: string, allowNegative = false): string {
  const negative = allowNegative && raw.trimStart().startsWith('-');
  let cleaned = raw.replace(/[^0-9.]/g, '');

  const dotIndex = cleaned.indexOf('.');

  if (dotIndex !== -1) {
    const intPart = cleaned.slice(0, dotIndex);
    const decPart = cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
    cleaned = decPart.length > 0 ? `${intPart}.${decPart}` : `${intPart}.`;
  }

  if (negative) {
    return cleaned ? `-${cleaned}` : '-';
  }

  return cleaned;
}

export function formatMoneyInputDisplay(value: string): string {
  if (!value) {
    return '';
  }

  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;

  if (!unsigned) {
    return negative ? '-' : '';
  }

  const [intPart = '', decPart] = unsigned.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;

  return negative ? `-${formatted}` : formatted;
}
