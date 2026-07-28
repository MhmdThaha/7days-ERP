import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { parseUserRole } from '@/lib/auth/user-role';
import { DEFAULT_ORG_TIMEZONE } from '@/lib/domain/constants/organization';
import { DomainError } from '@/lib/domain/errors';
import { getFirestore } from '@/lib/repositories/base.repository';
import type { UserProfile } from '@/types/user';

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function mapUserProfile(uid: string, data: FirebaseFirestore.DocumentData): UserProfile {
  return {
    id: uid,
    email: typeof data.email === 'string' ? data.email : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
    organizationId: typeof data.organizationId === 'string' ? data.organizationId : '',
    role: parseUserRole(data.role),
  };
}

export type CreateOwnerBakeryInput = {
  uid: string;
  email: string;
  displayName: string;
  bakeryName: string;
};

export const userRepository = {
  async getById(uid: string): Promise<UserProfile | null> {
    const doc = await getFirestore().collection('users').doc(uid).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();

    if (!data) {
      return null;
    }

    return mapUserProfile(uid, data);
  },

  async createOwnerBakery(input: CreateOwnerBakeryInput): Promise<UserProfile> {
    const existing = await this.getById(input.uid);

    if (existing) {
      throw new DomainError('VALIDATION_ERROR', 'A bakery is already linked to this account.');
    }

    const db = getFirestore();
    const orgRef = db.collection('organizations').doc();
    const orgId = orgRef.id;
    const now = Timestamp.now();
    const slugBase = toSlug(input.bakeryName) || 'bakery';
    const slug = `${slugBase}-${orgId.slice(0, 8)}`;

    const batch = db.batch();

    batch.set(orgRef, {
      id: orgId,
      name: input.bakeryName.trim(),
      slug,
      ownerId: input.uid,
      currency: 'INR',
      locale: 'en-IN',
      timezone: DEFAULT_ORG_TIMEZONE,
      fiscalYearStartMonth: 4,
      dayCloseEnabled: false,
      taxInclusive: false,
      logoUrl: null,
      createdAt: now,
      updatedAt: now,
    });

    batch.set(db.collection('users').doc(input.uid), {
      id: input.uid,
      email: input.email.trim(),
      displayName: input.displayName.trim(),
      photoUrl: null,
      organizationId: orgId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();

    return {
      id: input.uid,
      email: input.email.trim(),
      displayName: input.displayName.trim(),
      photoUrl: null,
      organizationId: orgId,
      role: 'owner',
    };
  },
};
