import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseUserRole, requireUserRole } from '@/lib/auth/user-role';
import { DomainError } from '@/lib/domain/errors';

const SRC_DIR = join(process.cwd(), 'src');

function read(pathSuffix: string): string {
  return readFileSync(join(SRC_DIR, pathSuffix), 'utf8');
}

describe('Phase 1 regression: uid spoofing cannot return', () => {
  it('has no getServerOrgContext in source', () => {
    const hits = searchSourceForPattern(/getServerOrgContext/);
    expect(hits).toEqual([]);
  });

  it('has no useAuthUid helper', () => {
    const hits = searchSourceForPattern(/useAuthUid/);
    expect(hits).toEqual([]);
  });

  it('has no client uid parameters in server actions', () => {
    const actionFiles = readdirSync(join(SRC_DIR, 'actions')).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );

    for (const file of actionFiles) {
      const source = readFileSync(join(SRC_DIR, 'actions', file), 'utf8');
      expect(source, file).not.toMatch(/uid:\s*string/);
    }
  });
});

describe('Phase 1 regression: role defaulting cannot return', () => {
  it('parseUserRole never returns owner for invalid values', () => {
    for (const value of [undefined, null, '', 'admin', 'superuser', 'OWNER']) {
      expect(parseUserRole(value)).not.toBe('owner');
    }
  });

  it('requireUserRole rejects missing and invalid roles', () => {
    expect(() => requireUserRole(undefined)).toThrow(DomainError);
    expect(() => requireUserRole('invalid-role')).toThrow(DomainError);
  });

  it('auth-server uses requireUserRole instead of owner defaulting', () => {
    const source = read('lib/firebase/auth-server.ts');

    expect(source).toContain('requireUserRole');
    expect(source).not.toMatch(/return 'owner'/);
    expect(source).not.toContain('normalizeRole');
  });

  it('user repository uses parseUserRole instead of owner defaulting', () => {
    const source = read('lib/repositories/user.repository.ts');

    expect(source).toContain('parseUserRole');
    expect(source).not.toMatch(/return 'owner'/);
    expect(source).not.toContain('normalizeRole');
  });
});

describe('Phase 1 regression: session-based auth required', () => {
  it('auth-server verifies session cookies', () => {
    const source = read('lib/firebase/auth-server.ts');

    expect(source).toContain('verifySessionCookie');
    expect(source).toContain('SESSION_COOKIE_NAME');
  });

  it('session API verifies ID tokens before creating cookies', () => {
    const source = read('app/api/auth/session/route.ts');

    expect(source).toContain('verifyIdToken');
    expect(source).toContain('createSessionCookie');
    expect(source).toContain('revokeRefreshTokens');
  });

  it('auth provider clears React Query cache on signOut', () => {
    const source = read('providers/auth-provider.tsx');

    expect(source).toContain('queryClient.clear()');
    expect(source).toContain('destroyServerSession');
  });
});

describe('Phase 1 regression: DEV role bypass removed', () => {
  it('has no getDevMemberRole references', () => {
    const hits = searchSourceForPattern(/getDevMemberRole|DEV_MEMBER_ROLE/);
    expect(hits).toEqual([]);
  });
});

function searchSourceForPattern(pattern: RegExp): string[] {
  const matches: string[] = [];

  walkDirectory(SRC_DIR, (filePath) => {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
      return;
    }

    const relative = filePath.slice(SRC_DIR.length + 1).replace(/\\/g, '/');

    if (relative.endsWith('.test.ts') || relative.endsWith('.test.tsx')) {
      return;
    }

    const source = readFileSync(filePath, 'utf8');

    if (pattern.test(source)) {
      matches.push(relative);
    }
  });

  return matches.sort();
}

function walkDirectory(directory: string, visit: (filePath: string) => void): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') {
        continue;
      }

      walkDirectory(fullPath, visit);
      continue;
    }

    visit(fullPath);
  }
}
