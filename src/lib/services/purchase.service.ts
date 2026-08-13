import 'server-only';

import {
  calculatePurchaseLineTotal,
  derivePurchaseQuantity,
  derivePurchaseUnitCost,
} from '@/lib/domain/calculations/purchase-pricing';
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
  PurchaseListPageParams,
  PurchaseListPageResult,
  PurchaseListParams,
  PurchaseListResult,
  UpdatePurchaseInput,
} from '@/types/purchase';

function calculateTotalAmount(lineItems: PurchaseLineItem[]): number {
  return lineItems.reduce((sum, lineItem) => sum + lineItem.lineTotal, 0);
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

  /**
   * Purchases page retrieval: empty search → Firestore listPage; non-empty search → legacy list()
   * substring semantics (unchanged).
   */
  async listPage(orgId: string, params: PurchaseListPageParams): Promise<PurchaseListPageResult> {
    const search = params.search?.trim() ?? '';

    if (search) {
      const result = await purchaseRepository.list(orgId, {
        search,
        status: params.status,
        page: params.page ?? 1,
        pageSize: params.pageSize,
      });

      const first = result.items[0];
      const last = result.items[result.items.length - 1];

      return {
        ...result,
        startCursor: first
          ? { purchaseDate: first.purchaseDate, purchaseNumber: first.purchaseNumber }
          : null,
        endCursor: last
          ? { purchaseDate: last.purchaseDate, purchaseNumber: last.purchaseNumber }
          : null,
      };
    }

    return purchaseRepository.listPage(orgId, {
      status: params.status,
      pageSize: params.pageSize,
      page: params.page,
      position: params.position,
      cursor: params.cursor,
    });
  },

  async getById(orgId: string, purchaseId: string): Promise<Purchase> {
    const purchase = await purchaseRepository.getById(orgId, purchaseId);

    if (!purchase) {
      throw new DomainError('NOT_FOUND', 'Purchase not found');
    }

    return purchase;
  },

  async create(orgId: string, input: CreatePurchaseInput, userId: string): Promise<Purchase> {
    const lineItems = await resolveLineItems(orgId, input.lineItems);
    const totalAmount = calculateTotalAmount(lineItems);

    return purchaseRepository.create(
      orgId,
      {
        ...input,
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
    const receiveStartedAt = performance.now();
    if (process.env.NODE_ENV !== 'production') {
      console.log('[TEMP-PERF][Save&Receive]', { stage: 'service.receive start', purchaseId });
    }

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

    const txnStartedAt = performance.now();
    const received = await purchaseRepository.receive(orgId, purchaseId, userId);
    const txnMs = Math.round(performance.now() - txnStartedAt);

    const summaryStartedAt = performance.now();
    await dailySummaryService.recalculate(orgId, received.purchaseDate);
    const summaryMs = Math.round(performance.now() - summaryStartedAt);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[TEMP-PERF][Save&Receive]', {
        stage: 'service.receive return',
        purchaseId,
        getByIdAndGuardsMs: Math.round(txnStartedAt - receiveStartedAt),
        receiveTxnMs: txnMs,
        dailySummaryMs: summaryMs,
        serviceReceiveTotalMs: Math.round(performance.now() - receiveStartedAt),
      });
    }

    return received;
  },
};
