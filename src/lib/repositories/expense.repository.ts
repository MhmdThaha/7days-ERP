import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { EXPENSE_CATEGORY_LABELS } from '@/lib/domain/constants/expense';
import { DomainError } from '@/lib/domain/errors';
import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import {
  buildAuditFields,
  getFirestore,
  getOrgCollection,
} from '@/lib/repositories/base.repository';
import type {
  Expense,
  ExpenseCategory,
  ExpenseListItem,
  ExpenseListParams,
  ExpenseListResult,
  ExpenseStatus,
  ExpenseStatusFilter,
} from '@/types/expense';

type ExpenseDocument = {
  organizationId: string;
  expenseNumber: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  status: ExpenseStatus;
  notes: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  completedAt: Timestamp | null;
  completedBy: string | null;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
};

function toExpense(id: string, data: ExpenseDocument): Expense {
  return {
    id,
    organizationId: data.organizationId,
    expenseNumber: data.expenseNumber,
    expenseDate: data.expenseDate,
    category: data.category,
    amount: data.amount,
    status: data.status,
    notes: data.notes,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy,
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    updatedBy: data.updatedBy,
    completedAt: timestampToDate(data.completedAt),
    completedBy: data.completedBy ?? null,
    deletedAt: timestampToDate(data.deletedAt),
    deletedBy: data.deletedBy,
  };
}

function toListItem(expense: Expense): ExpenseListItem {
  return {
    id: expense.id,
    expenseNumber: expense.expenseNumber,
    expenseDate: expense.expenseDate,
    category: expense.category,
    amount: expense.amount,
    status: expense.status,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

function matchesSearch(expense: ExpenseListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  const categoryLabel = EXPENSE_CATEGORY_LABELS[expense.category].toLowerCase();

  return (
    expense.expenseNumber.toLowerCase().includes(term) ||
    expense.category.toLowerCase().includes(term) ||
    categoryLabel.includes(term)
  );
}

function matchesCategory(expense: ExpenseListItem, category: ExpenseCategory | 'all' | undefined): boolean {
  if (!category || category === 'all') {
    return true;
  }

  return expense.category === category;
}

function matchesStatus(expense: ExpenseListItem, status: ExpenseStatusFilter | undefined): boolean {
  if (!status || status === 'all') {
    return true;
  }

  return expense.status === status;
}

function assertDraftExpenseInTransaction(expenseData: ExpenseDocument): void {
  if (expenseData.deletedAt) {
    throw new DomainError('NOT_FOUND', 'Expense not found');
  }

  if (expenseData.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft expenses can be modified');
  }
}

export const expenseRepository = {
  async list(orgId: string, params: ExpenseListParams): Promise<ExpenseListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const search = params.search ?? '';

    const snapshot = await getOrgCollection(orgId, 'expenses')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toExpense(doc.id, doc.data() as ExpenseDocument))
      .map(toListItem)
      .filter((expense) => matchesSearch(expense, search))
      .filter((expense) => matchesCategory(expense, params.category))
      .filter((expense) => matchesStatus(expense, params.status))
      .sort((a, b) => {
        const dateCompare = b.expenseDate.localeCompare(a.expenseDate);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return b.expenseNumber.localeCompare(a.expenseNumber);
      });

    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return {
      items: allItems.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  },

  async getById(orgId: string, expenseId: string): Promise<Expense | null> {
    const doc = await getOrgCollection(orgId, 'expenses').doc(expenseId).get();

    if (!doc.exists) {
      return null;
    }

    const expense = toExpense(doc.id, doc.data() as ExpenseDocument);

    if (expense.deletedAt) {
      return null;
    }

    return expense;
  },

  async findByExpenseNumber(
    orgId: string,
    expenseNumber: string,
    excludeId?: string,
  ): Promise<Expense | null> {
    const normalizedNumber = expenseNumber.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'expenses')
      .where('expenseNumber', '==', normalizedNumber)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];

    if (!doc) {
      return null;
    }

    if (excludeId && doc.id === excludeId) {
      return null;
    }

    return toExpense(doc.id, doc.data() as ExpenseDocument);
  },

  async getHighestExpenseNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'expenses')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as ExpenseDocument;
      const match = /^EXP-(\d+)$/i.exec(data.expenseNumber);

      if (match?.[1]) {
        const value = Number.parseInt(match[1], 10);

        if (!Number.isNaN(value) && value > highest) {
          highest = value;
        }
      }
    }

    return highest;
  },

  async create(
    orgId: string,
    input: {
      expenseNumber: string;
      expenseDate: string;
      category: ExpenseCategory;
      amount: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<Expense> {
    const collection = getOrgCollection(orgId, 'expenses');
    const docRef = collection.doc();
    const now = Timestamp.now();

    const document: ExpenseDocument = {
      organizationId: orgId,
      expenseNumber: input.expenseNumber.trim().toUpperCase(),
      expenseDate: input.expenseDate,
      category: input.category,
      amount: input.amount,
      status: 'draft',
      notes: normalizeNullableString(input.notes),
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      completedAt: null,
      completedBy: null,
      deletedAt: null,
      deletedBy: null,
    };

    await docRef.set(document);
    return toExpense(docRef.id, document);
  },

  async update(
    orgId: string,
    expenseId: string,
    input: {
      expenseDate?: string;
      category?: ExpenseCategory;
      amount?: number;
      notes?: string | null;
    },
    userId: string,
  ): Promise<Expense> {
    const firestore = getFirestore();
    const audit = buildAuditFields(userId, false);

    const updates: Partial<ExpenseDocument> = {
      ...audit,
    };

    if (input.expenseDate !== undefined) {
      updates.expenseDate = input.expenseDate;
    }

    if (input.category !== undefined) {
      updates.category = input.category;
    }

    if (input.amount !== undefined) {
      updates.amount = input.amount;
    }

    if (input.notes !== undefined) {
      updates.notes = normalizeNullableString(input.notes);
    }

    return firestore.runTransaction(async (transaction) => {
      const expenseRef = getOrgCollection(orgId, 'expenses').doc(expenseId);
      const expenseSnap = await transaction.get(expenseRef);

      if (!expenseSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Expense not found');
      }

      const expenseData = expenseSnap.data() as ExpenseDocument;
      assertDraftExpenseInTransaction(expenseData);

      transaction.update(expenseRef, updates);

      const updatedExpense: ExpenseDocument = {
        ...expenseData,
        ...updates,
      };

      return toExpense(expenseSnap.id, updatedExpense);
    });
  },

  async softDelete(orgId: string, expenseId: string, userId: string): Promise<void> {
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const expenseRef = getOrgCollection(orgId, 'expenses').doc(expenseId);
      const expenseSnap = await transaction.get(expenseRef);

      if (!expenseSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Expense not found');
      }

      const expenseData = expenseSnap.data() as ExpenseDocument;
      assertDraftExpenseInTransaction(expenseData);

      const now = Timestamp.now();

      transaction.update(expenseRef, {
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });
    });
  },

  async complete(orgId: string, expenseId: string, userId: string): Promise<Expense> {
    const firestore = getFirestore();

    return firestore.runTransaction(async (transaction) => {
      const expenseRef = getOrgCollection(orgId, 'expenses').doc(expenseId);
      const expenseSnap = await transaction.get(expenseRef);

      if (!expenseSnap.exists) {
        throw new DomainError('NOT_FOUND', 'Expense not found');
      }

      const expenseData = expenseSnap.data() as ExpenseDocument;

      if (expenseData.deletedAt) {
        throw new DomainError('NOT_FOUND', 'Expense not found');
      }

      if (expenseData.status !== 'draft') {
        throw new DomainError('VALIDATION_ERROR', 'This expense has already been completed');
      }

      if (expenseData.amount <= 0) {
        throw new DomainError('VALIDATION_ERROR', 'Amount must be greater than zero');
      }

      const now = Timestamp.now();

      transaction.update(expenseRef, {
        status: 'completed',
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      });

      const updatedExpense: ExpenseDocument = {
        ...expenseData,
        status: 'completed',
        completedAt: now,
        completedBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      return toExpense(expenseSnap.id, updatedExpense);
    });
  },
};
