import 'server-only';

import { DomainError } from '@/lib/domain/errors';

export type ServerOrgContext = {
  orgId: string;
  userId: string;
};

export async function getServerOrgContext(): Promise<ServerOrgContext> {
  const orgId = process.env.DEV_ORG_ID?.trim();
  const userId = process.env.DEV_USER_ID?.trim() ?? 'dev-user';

  if (!orgId) {
    throw new DomainError(
      'ORG_NOT_CONFIGURED',
      'Organization context is not configured. Set DEV_ORG_ID in your environment.',
    );
  }

  return { orgId, userId };
}
