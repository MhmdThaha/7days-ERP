import 'server-only';

import { Timestamp, type Transaction } from 'firebase-admin/firestore';

import { DomainError } from '@/lib/domain/errors';
import { getOrgCollection } from '@/lib/repositories/base.repository';

export type UniqueNumberKind =
  | 'sale'
  | 'purchase'
  | 'production'
  | 'expense'
  | 'wastage'
  | 'return';

function buildLockDocId(kind: UniqueNumberKind, normalizedNumber: string): string {
  return `${kind}_${normalizedNumber}`;
}

const DUPLICATE_NUMBER_MESSAGES: Record<UniqueNumberKind, string> = {
  sale: 'Sale number already exists',
  purchase: 'Purchase number already exists',
  production: 'Production number already exists',
  expense: 'Expense number already exists',
  wastage: 'Wastage number already exists',
  return: 'Return number already exists',
};

/**
 * Atomically reserves a document number inside a Firestore transaction.
 * Prevents duplicate numbers when concurrent creates race on the same value.
 */
export async function reserveUniqueNumberInTransaction(
  transaction: Transaction,
  orgId: string,
  kind: UniqueNumberKind,
  documentNumber: string,
  documentId: string,
): Promise<void> {
  const normalizedNumber = documentNumber.trim().toUpperCase();
  const lockRef = getOrgCollection(orgId, 'uniqueNumbers').doc(
    buildLockDocId(kind, normalizedNumber),
  );
  const lockSnap = await transaction.get(lockRef);

  if (lockSnap.exists) {
    throw new DomainError('VALIDATION_ERROR', DUPLICATE_NUMBER_MESSAGES[kind]);
  }

  transaction.set(lockRef, {
    kind,
    number: normalizedNumber,
    documentId,
    createdAt: Timestamp.now(),
  });
}
