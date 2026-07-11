import 'server-only';

import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import { getAdminFirestore } from '@/lib/firebase/admin';

export function getFirestore(): Firestore {
  return getAdminFirestore();
}

export function getOrgCollection(orgId: string, subcollection: string) {
  return getFirestore().collection('organizations').doc(orgId).collection(subcollection);
}

export function buildAuditFields(userId: string, isCreate: boolean) {
  const now = Timestamp.now();

  if (isCreate) {
    return {
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      deletedAt: null as Timestamp | null,
      deletedBy: null as string | null,
    };
  }

  return {
    updatedAt: now,
    updatedBy: userId,
  };
}
