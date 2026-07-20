import 'server-only';

import { DEFAULT_ORG_TIMEZONE } from '@/lib/domain/constants/organization';
import { getFirestore } from '@/lib/repositories/base.repository';

export const organizationRepository = {
  async getTimezone(orgId: string): Promise<string> {
    const doc = await getFirestore().collection('organizations').doc(orgId).get();

    if (!doc.exists) {
      return DEFAULT_ORG_TIMEZONE;
    }

    const timezone = doc.data()?.timezone;

    if (typeof timezone === 'string' && timezone.trim().length > 0) {
      return timezone.trim();
    }

    return DEFAULT_ORG_TIMEZONE;
  },
};
