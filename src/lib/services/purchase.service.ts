import 'server-only';

import {
  calculatePurchaseLineTotal,
  derivePurchaseQuantity,
  derivePurchaseUnitCost,
} from '@/lib/domain/calculations/purchase-pricing';
import { PURCHASE_NUMBER_PREFIX } from '@/lib/domain/constants/purchase';
import { DomainError } from '@/lib/domain/errors';
import { convertToCanonicalQuantity } from '@/lib/domain/units/uom-conversion';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import {
  generateLineItemId,
  purchaseRepository,
} from '@/lib/repositories/purchase.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  CreatePurchaseInput,
  Purchase,
  PurchaseLineItem,
  PurchaseLineItemInput,
  PurchaseListParams,
  PurchaseListResult,
  UpdatePurchaseInput,
} from '@/types/purchase';

function formatGeneratedNumber(sequence: number): string {
  return `${PURCHASE_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}


function calculateTotalAmount(lineItems: PurchaseLineItem[]): number {
  return lineItems.reduce((sum, lineItem) => sum + lineItem.lineTotal, 0);
}

async function resolvePurchaseNumber(orgId: string): Promise<string> {
  const highest = await purchaseRepository.getHighestPurchaseNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedNumber(next);

  while (await purchaseRepository.findByPurchaseNumber(orgId, generated)) {
    next += 1;
    generated = formatGeneratedNumber(next);
  }

  return generated;
}

async function resolveLineItems(
  orgId: string,
  lineItems: PurchaseLineItemInput[],
): Promise<PurchaseLineItem[]> {
  const resolved: PurchaseLineItem[] = [];

  for (const lineItem of lineItems) {
    const rawMaterial = await rawMaterialRepository.getById(orgId, lineItem.rawMaterialId);

    if (!rawMaterial) {
      throw new DomainError('NOT_FOUND', 'One or more raw materials were not found');
    }

    if (!rawMaterial.isActive) {
      throw new DomainError('VALIDATION_ERROR', `Raw material "${rawMaterial.name}" is inactive`);
    }

    const entryUnit = lineItem.unit || rawMaterial.unit;
    const canonicalPackSize = convertToCanonicalQuantity(
      lineItem.packSize,
      entryUnit,
      rawMaterial.unit,
    );

    resolved.push({
      id: lineItem.id ?? generateLineItemId(),
      rawMaterialId: rawMaterial.id,
      rawMaterialCode: rawMaterial.code,
      rawMaterialName: rawMaterial.name,
      quantity: derivePurchaseQuantity(lineItem.packCount, canonicalPackSize),
      unit: rawMaterial.unit,
      unitCost: derivePurchaseUnitCost(lineItem.packPrice, canonicalPackSize),
      lineTotal: calculatePurchaseLineTotal(lineItem.packCount, lineItem.packPrice),
      packCount: lineItem.packCount,
      packSize: canonicalPackSize,
      packPrice: lineItem.packPrice,
    });
  }

  return resolved;
}

function assertDraftPurchase(purchase: Purchase): void {
  if (purchase.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft purchases can be modified');
  }
}

export const purchaseService = {
  async list(orgId: string, params: PurchaseListParams): Promise<PurchaseListResult> {
    return purchaseRepository.list(orgId, params);
  },

  async getById(orgId: string, purchaseId: string): Promise<Purchase> {
    const purchase = await purchaseRepository.getById(orgId, purchaseId);

    if (!purchase) {
      throw new DomainError('NOT_FOUND', 'Purchase not found');
    }

    return purchase;
  },

  async create(orgId: string, input: CreatePurchaseInput, userId: string): Promise<Purchase> {
    const purchaseNumber = await resolvePurchaseNumber(orgId);
    const lineItems = await resolveLineItems(orgId, input.lineItems);
    const totalAmount = calculateTotalAmount(lineItems);

    return purchaseRepository.create(
      orgId,
      {
        ...input,
        purchaseNumber,
        lineItems,
        totalAmount,
      },
      userId,
    );
  },

  async update(
    orgId: string,
    purchaseId: string,
    input: UpdatePurchaseInput,
    userId: string,
  ): Promise<Purchase> {
    const existing = await purchaseRepository.getById(orgId, purchaseId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Purchase not found');
    }

    assertDraftPurchase(existing);

    let lineItems = existing.lineItems;
    let totalAmount = existing.totalAmount;

    if (input.lineItems) {
      lineItems = await resolveLineItems(orgId, input.lineItems);
      totalAmount = calculateTotalAmount(lineItems);
    }

    return purchaseRepository.update(
      orgId,
      purchaseId,
      {
        ...input,
        lineItems: input.lineItems ? lineItems : undefined,
        totalAmount: input.lineItems ? totalAmount : undefined,
      },
      userId,
    );
  },

  async softDelete(orgId: string, purchaseId: string, userId: string): Promise<void> {
    const existing = await purchaseRepository.getById(orgId, purchaseId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Purchase not found');
    }

    assertDraftPurchase(existing);

    await purchaseRepository.softDelete(orgId, purchaseId, userId);
  },

  async receive(orgId: string, purchaseId: string, userId: string): Promise<Purchase> {
    const purchase = await purchaseRepository.getById(orgId, purchaseId);

    if (!purchase) {
      throw new DomainError('NOT_FOUND', 'Purchase not found');
    }

    if (purchase.status !== 'draft') {
      throw new DomainError('VALIDATION_ERROR', 'This purchase has already been received');
    }

    if (purchase.lineItems.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Purchase must have at least one line item');
    }

    const received = await purchaseRepository.receive(orgId, purchaseId, userId);
    await dailySummaryService.recalculate(orgId, received.purchaseDate);
    return received;
  },
};
