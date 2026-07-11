import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { normalizeNullableString, timestampToDate } from '@/lib/firebase/converters';
import { buildAuditFields, getOrgCollection } from '@/lib/repositories/base.repository';
import type {
  CreateRawMaterialInput,
  RawMaterial,
  RawMaterialListItem,
  RawMaterialListParams,
  RawMaterialListResult,
  RawMaterialStatusFilter,
  UpdateRawMaterialInput,
} from '@/types/raw-material';

type RawMaterialDocument = {
  organizationId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: number | null;
  description: string | null;
  isActive: boolean;
  currentStock: number;
  averageCost: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  deletedAt: Timestamp | null;
  deletedBy: string | null;
};

function toRawMaterial(id: string, data: RawMaterialDocument): RawMaterial {
  return {
    id,
    organizationId: data.organizationId,
    code: data.code,
    name: data.name,
    category: data.category,
    unit: data.unit,
    reorderLevel: data.reorderLevel,
    description: data.description,
    isActive: data.isActive,
    currentStock: data.currentStock,
    averageCost: data.averageCost,
    createdAt: timestampToDate(data.createdAt) ?? new Date(),
    createdBy: data.createdBy,
    updatedAt: timestampToDate(data.updatedAt) ?? new Date(),
    updatedBy: data.updatedBy,
    deletedAt: timestampToDate(data.deletedAt),
    deletedBy: data.deletedBy,
  };
}

function toListItem(rawMaterial: RawMaterial): RawMaterialListItem {
  return {
    id: rawMaterial.id,
    code: rawMaterial.code,
    name: rawMaterial.name,
    category: rawMaterial.category,
    unit: rawMaterial.unit,
    reorderLevel: rawMaterial.reorderLevel,
    description: rawMaterial.description,
    isActive: rawMaterial.isActive,
    currentStock: rawMaterial.currentStock,
    averageCost: rawMaterial.averageCost,
    createdAt: rawMaterial.createdAt,
    updatedAt: rawMaterial.updatedAt,
  };
}

function matchesStatus(isActive: boolean, status: RawMaterialStatusFilter): boolean {
  if (status === 'all') {
    return true;
  }

  return status === 'active' ? isActive : !isActive;
}

function matchesSearch(rawMaterial: RawMaterialListItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return (
    rawMaterial.name.toLowerCase().includes(term) ||
    rawMaterial.code.toLowerCase().includes(term)
  );
}

function matchesCategory(rawMaterial: RawMaterialListItem, category: string | undefined): boolean {
  if (!category || category === 'all') {
    return true;
  }

  return rawMaterial.category === category;
}

function isLowStock(rawMaterial: RawMaterialListItem): boolean {
  if (rawMaterial.reorderLevel === null) {
    return false;
  }

  return rawMaterial.currentStock <= rawMaterial.reorderLevel;
}

export const rawMaterialRepository = {
  async list(orgId: string, params: RawMaterialListParams): Promise<RawMaterialListResult> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const status = params.status ?? 'active';
    const search = params.search ?? '';
    const category = params.category;
    const lowStockOnly = params.lowStockOnly ?? false;

    const snapshot = await getOrgCollection(orgId, 'rawMaterials')
      .where('deletedAt', '==', null)
      .get();

    const allItems = snapshot.docs
      .map((doc) => toRawMaterial(doc.id, doc.data() as RawMaterialDocument))
      .filter((rawMaterial) => matchesStatus(rawMaterial.isActive, status))
      .map(toListItem)
      .filter((rawMaterial) => matchesSearch(rawMaterial, search))
      .filter((rawMaterial) => matchesCategory(rawMaterial, category))
      .filter((rawMaterial) => !lowStockOnly || isLowStock(rawMaterial))
      .sort((a, b) => a.name.localeCompare(b.name));

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

  async getById(orgId: string, rawMaterialId: string): Promise<RawMaterial | null> {
    const doc = await getOrgCollection(orgId, 'rawMaterials').doc(rawMaterialId).get();

    if (!doc.exists) {
      return null;
    }

    const rawMaterial = toRawMaterial(doc.id, doc.data() as RawMaterialDocument);

    if (rawMaterial.deletedAt) {
      return null;
    }

    return rawMaterial;
  },

  async findByCode(
    orgId: string,
    code: string,
    excludeId?: string,
  ): Promise<RawMaterial | null> {
    const normalizedCode = code.trim().toUpperCase();
    const snapshot = await getOrgCollection(orgId, 'rawMaterials')
      .where('code', '==', normalizedCode)
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

    return toRawMaterial(doc.id, doc.data() as RawMaterialDocument);
  },

  async findByName(
    orgId: string,
    name: string,
    excludeId?: string,
  ): Promise<RawMaterial | null> {
    const normalizedName = name.trim().toLowerCase();
    const snapshot = await getOrgCollection(orgId, 'rawMaterials')
      .where('deletedAt', '==', null)
      .get();

    const match = snapshot.docs.find((doc) => {
      if (excludeId && doc.id === excludeId) {
        return false;
      }

      const data = doc.data() as RawMaterialDocument;
      return data.name.trim().toLowerCase() === normalizedName;
    });

    if (!match) {
      return null;
    }

    return toRawMaterial(match.id, match.data() as RawMaterialDocument);
  },

  async getHighestCodeNumber(orgId: string): Promise<number> {
    const snapshot = await getOrgCollection(orgId, 'rawMaterials')
      .where('deletedAt', '==', null)
      .get();

    let highest = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as RawMaterialDocument;
      const match = /^RM-(\d+)$/i.exec(data.code);

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
    input: CreateRawMaterialInput & { code: string },
    userId: string,
  ): Promise<RawMaterial> {
    const collection = getOrgCollection(orgId, 'rawMaterials');
    const docRef = collection.doc();
    const now = Timestamp.now();

    const document: RawMaterialDocument = {
      organizationId: orgId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      category: input.category,
      unit: input.unit,
      reorderLevel: input.reorderLevel ?? null,
      description: normalizeNullableString(input.description),
      isActive: input.isActive ?? true,
      currentStock: 0,
      averageCost: 0,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
      deletedAt: null,
      deletedBy: null,
    };

    await docRef.set(document);
    return toRawMaterial(docRef.id, document);
  },

  async update(
    orgId: string,
    rawMaterialId: string,
    input: UpdateRawMaterialInput,
    userId: string,
  ): Promise<RawMaterial> {
    const docRef = getOrgCollection(orgId, 'rawMaterials').doc(rawMaterialId);
    const existing = await docRef.get();

    if (!existing.exists) {
      throw new Error('Raw material not found');
    }

    const audit = buildAuditFields(userId, false);

    const updates: Partial<RawMaterialDocument> = {
      ...audit,
    };

    if (input.code !== undefined) {
      updates.code = input.code.trim().toUpperCase();
    }

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }

    if (input.category !== undefined) {
      updates.category = input.category;
    }

    if (input.unit !== undefined) {
      updates.unit = input.unit;
    }

    if (input.reorderLevel !== undefined) {
      updates.reorderLevel = input.reorderLevel;
    }

    if (input.description !== undefined) {
      updates.description = normalizeNullableString(input.description);
    }

    if (input.isActive !== undefined) {
      updates.isActive = input.isActive;
    }

    await docRef.update(updates);

    const updated = await docRef.get();
    return toRawMaterial(updated.id, updated.data() as RawMaterialDocument);
  },

  async softDelete(orgId: string, rawMaterialId: string, userId: string): Promise<void> {
    const docRef = getOrgCollection(orgId, 'rawMaterials').doc(rawMaterialId);
    const now = Timestamp.now();

    await docRef.update({
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
      updatedBy: userId,
      isActive: false,
    });
  },
};
