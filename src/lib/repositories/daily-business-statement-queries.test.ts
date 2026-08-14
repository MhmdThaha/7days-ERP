import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function methodSource(filePath: string, methodName: string): string {
  const source = readFileSync(resolve(filePath), 'utf8');
  const start = source.indexOf(`async ${methodName}`);

  if (start < 0) {
    throw new Error(`Missing ${methodName} in ${filePath}`);
  }

  const next = source.indexOf('\n  async ', start + 1);
  return next > 0 ? source.slice(start, next) : source.slice(start);
}

describe('daily business statement date-bounded repository helpers', () => {
  it.each([
    ['src/lib/repositories/sale.repository.ts', 'listCompletedByDateWithLines', 'saleDate'],
    ['src/lib/repositories/expense.repository.ts', 'listCompletedByDateWithDetails', 'expenseDate'],
    ['src/lib/repositories/production.repository.ts', 'listCompletedByDateWithLines', 'productionDate'],
    ['src/lib/repositories/wastage.repository.ts', 'listCompletedByDateWithLines', 'wastageDate'],
    ['src/lib/repositories/return.repository.ts', 'listCompletedByDateWithLines', 'returnDate'],
  ])('%s %s filters deletedAt, completed status, and %s', (filePath, methodName, dateField) => {
    const source = methodSource(filePath, methodName);

    expect(source).toContain(".where('deletedAt', '==', null)");
    expect(source).toContain(".where('status', '==', 'completed')");
    expect(source).toContain(`.where('${dateField}', '==', date)`);
    expect(source).not.toContain('getById');
    expect(source).not.toMatch(/\.limit\(/);
  });

  it('Today\'s Report export passes reportDate into the statement action', () => {
    const page = readFileSync(resolve('src/components/reports/daily-report-page.tsx'), 'utf8');

    expect(page).toContain('getDailyBusinessStatementAction(reportDate)');
    expect(page).toContain('const reportDate = data.reportDate');
    expect(page).not.toContain('getDateStringInTimezone');
    expect(page).not.toContain('downloadDailyReport');
  });
});
