import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ACTIONS_DIR = join(process.cwd(), 'src/actions');

function listActionSourceFiles(): string[] {
  return readdirSync(ACTIONS_DIR).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
  );
}

function readActionSource(fileName: string): string {
  return readFileSync(join(ACTIONS_DIR, fileName), 'utf8');
}

function listExportedActions(source: string): string[] {
  return [...source.matchAll(/export async function (\w+Action)\(/g)].map((match) => match[1]);
}

describe('server action security contracts', () => {
  const actionFiles = listActionSourceFiles();

  it('includes every business action module', () => {
    expect(actionFiles).toEqual(
      expect.arrayContaining([
        'bakery.ts',
        'products.ts',
        'sales.ts',
        'purchases.ts',
        'import.ts',
        'dashboard.ts',
      ]),
    );
  });

  it.each(actionFiles)('%s does not accept client uid parameters', (fileName) => {
    const source = readActionSource(fileName);

    expect(source).not.toMatch(/uid:\s*string/);
    expect(source).not.toMatch(/getServerOrgContext/);
    expect(source).not.toMatch(/useAuthUid/);
    expect(source).not.toMatch(/requireAuthUid/);
  });

  it.each(actionFiles)('%s requires verified server authentication', (fileName) => {
    const source = readActionSource(fileName);

    if (fileName === 'bakery.ts') {
      expect(source).toContain('getAuthenticatedUserId');
      expect(source).not.toContain('getAuthenticatedContext');
      return;
    }

    expect(source).toContain('getAuthenticatedContext');
  });

  it.each(actionFiles.filter((file) => file !== 'bakery.ts'))(
    '%s enforces RBAC via assertCan',
    (fileName) => {
      const source = readActionSource(fileName);
      const actions = listExportedActions(source);

      expect(actions.length).toBeGreaterThan(0);
      expect(source).toContain('assertCan(');
    },
  );

  it.each(actionFiles.filter((file) => file !== 'bakery.ts'))(
    '%s derives orgId from getAuthenticatedContext',
    (fileName) => {
      const source = readActionSource(fileName);

      expect(source).toMatch(/const \{ orgId[,}]/);
      expect(source).not.toMatch(/orgId:\s*string/);
    },
  );
});

describe('server action inventory', () => {
  it('tracks all exported server actions', () => {
    const allActions = listActionSourceFiles().flatMap((fileName) =>
      listExportedActions(readActionSource(fileName)),
    );

    expect(allActions.length).toBeGreaterThanOrEqual(60);
    expect(allActions).toEqual(expect.arrayContaining(['listProductsAction', 'getDailyReportAction']));
  });
});
