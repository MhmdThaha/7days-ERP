import 'server-only';

import { RETURN_NUMBER_PREFIX } from '@/lib/domain/constants/return';
import {
  aggregateReturnedQuantitiesBySaleLineId,
  findSaleLine,
  getRemainingReturnableQuantity,
  saleHasReturnableQuantity,
} from '@/lib/domain/calculations/return-sale-linkage';
import { DomainError } from '@/lib/domain/errors';
import { generateReturnLineId, returnRepository } from '@/lib/repositories/return.repository';
import { saleRepository } from '@/lib/repositories/sale.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  CreateReturnInput,
  ReturnEntry,
  ReturnLineItem,
  ReturnLineItemInput,
  ReturnListParams,
  ReturnListResult,
  SaleReturnContext,
  SaleReturnLineContext,
  UpdateReturnInput,
} from '@/types/return';
import type { Sale } from '@/types/sale';

function formatGeneratedNumber(sequence: number): string {
  return `${RETURN_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

function calculateTotalUnits(lines: ReturnLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

async function resolveReturnNumber(orgId: string): Promise<string> {
  const highest = await returnRepository.getHighestReturnNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedNumber(next);

  while (await returnRepository.findByReturnNumber(orgId, generated)) {
    next += 1;
    generated = formatGeneratedNumber(next);
  }

  return generated;
}

async function getCompletedSale(orgId: string, saleId: string): Promise<Sale> {
  const sale = await saleRepository.getById(orgId, saleId);

  if (!sale) {
    throw new DomainError('NOT_FOUND', 'Sale not found');
  }

  if (sale.status !== 'completed') {
    throw new DomainError('VALIDATION_ERROR', 'Returns can only be recorded against completed sales');
  }

  return sale;
}

async function resolveLinkedLineItems(
  orgId: string,
  sourceSaleId: string,
  lines: ReturnLineItemInput[],
  options?: { excludeReturnId?: string },
): Promise<{ sale: Sale; lines: ReturnLineItem[] }> {
  const sale = await getCompletedSale(orgId, sourceSaleId);

  if (lines.length === 0) {
    throw new DomainError('VALIDATION_ERROR', 'Return must have at least one sale line');
  }

  const siblingReturns = await returnRepository.listBySourceSaleId(orgId, sourceSaleId);
  const returnedBySaleLineId = aggregateReturnedQuantitiesBySaleLineId(siblingReturns, {
    excludeReturnId: options?.excludeReturnId,
    includeDrafts: true,
  });

  const resolved: ReturnLineItem[] = [];
  const seenSaleLineIds = new Set<string>();

  for (const line of lines) {
    if (seenSaleLineIds.has(line.saleLineId)) {
      throw new DomainError('VALIDATION_ERROR', 'Each sale line can only appear once on a return');
    }

    seenSaleLineIds.add(line.saleLineId);

    const saleLine = findSaleLine(sale, line.saleLineId);

    if (!saleLine) {
      throw new DomainError('NOT_FOUND', 'One or more sale lines were not found');
    }

    const remaining = getRemainingReturnableQuantity(saleLine, returnedBySaleLineId);

    if (line.quantity > remaining) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Only ${remaining} ${saleLine.unit} of "${saleLine.productNameSnapshot}" remain available to return from this sale`,
      );
    }

    returnedBySaleLineId.set(
      saleLine.id,
      (returnedBySaleLineId.get(saleLine.id) ?? 0) + line.quantity,
    );

    resolved.push({
      id: line.id ?? generateReturnLineId(),
      saleLineId: saleLine.id,
      productId: saleLine.productId,
      productNameSnapshot: saleLine.productNameSnapshot,
      productCodeSnapshot: saleLine.productCodeSnapshot,
      quantity: line.quantity,
      unit: saleLine.unit,
      sellingPriceSnapshot: saleLine.sellingPriceSnapshot,
      unitCostSnapshot: saleLine.unitCost,
    });
  }

  return { sale, lines: resolved };
}

function assertDraftReturn(returnEntry: ReturnEntry): void {
  if (returnEntry.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft returns can be modified');
  }
}

export const returnService = {
  async list(orgId: string, params: ReturnListParams): Promise<ReturnListResult> {
    return returnRepository.list(orgId, params);
  },

  async getById(orgId: string, returnId: string): Promise<ReturnEntry> {
    const returnEntry = await returnRepository.getById(orgId, returnId);

    if (!returnEntry) {
      throw new DomainError('NOT_FOUND', 'Return not found');
    }

    return returnEntry;
  },

  async getSaleReturnContext(orgId: string, saleId: string): Promise<SaleReturnContext> {
    const sale = await getCompletedSale(orgId, saleId);
    const siblingReturns = await returnRepository.listBySourceSaleId(orgId, saleId);
    const returnedBySaleLineId = aggregateReturnedQuantitiesBySaleLineId(siblingReturns, {
      includeDrafts: true,
    });

    const lines: SaleReturnLineContext[] = sale.lines.map((saleLine) => ({
      saleLineId: saleLine.id,
      productId: saleLine.productId,
      productNameSnapshot: saleLine.productNameSnapshot,
      productCodeSnapshot: saleLine.productCodeSnapshot,
      unit: saleLine.unit,
      soldQuantity: saleLine.quantity,
      returnedQuantity: returnedBySaleLineId.get(saleLine.id) ?? 0,
      remainingReturnableQuantity: getRemainingReturnableQuantity(saleLine, returnedBySaleLineId),
      sellingPriceSnapshot: saleLine.sellingPriceSnapshot,
    }));

    return {
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      saleDate: sale.saleDate,
      customerNameSnapshot: sale.customerNameSnapshot,
      lines,
      hasReturnableQuantity: saleHasReturnableQuantity(sale, returnedBySaleLineId),
    };
  },

  async create(orgId: string, input: CreateReturnInput, userId: string): Promise<ReturnEntry> {
    const { sale, lines } = await resolveLinkedLineItems(orgId, input.sourceSaleId, input.lines);
    const returnNumber = await resolveReturnNumber(orgId);
    const totalUnits = calculateTotalUnits(lines);

    return returnRepository.create(
      orgId,
      {
        returnNumber,
        returnDate: input.returnDate,
        reason: input.reason,
        sourceSaleId: sale.id,
        sourceSaleNumberSnapshot: sale.saleNumber,
        lines,
        totalUnits,
        notes: input.notes,
      },
      userId,
    );
  },

  async update(
    orgId: string,
    returnId: string,
    input: UpdateReturnInput,
    userId: string,
  ): Promise<ReturnEntry> {
    const existing = await returnRepository.getById(orgId, returnId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Return not found');
    }

    assertDraftReturn(existing);

    let lines = existing.lines;
    let totalUnits = existing.totalUnits;

    if (input.lines) {
      if (!existing.sourceSaleId) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Legacy returns cannot change lines. Create a new sale-linked return instead.',
        );
      }

      const resolved = await resolveLinkedLineItems(orgId, existing.sourceSaleId, input.lines, {
        excludeReturnId: returnId,
      });
      lines = resolved.lines;
      totalUnits = calculateTotalUnits(lines);
    }

    return returnRepository.update(
      orgId,
      returnId,
      {
        returnDate: input.returnDate,
        reason: input.reason,
        lines: input.lines ? lines : undefined,
        totalUnits: input.lines ? totalUnits : undefined,
        notes: input.notes,
      },
      userId,
    );
  },

  async softDelete(orgId: string, returnId: string, userId: string): Promise<void> {
    const existing = await returnRepository.getById(orgId, returnId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Return not found');
    }

    assertDraftReturn(existing);

    await returnRepository.softDelete(orgId, returnId, userId);
  },

  async complete(orgId: string, returnId: string, userId: string): Promise<ReturnEntry> {
    const existing = await returnRepository.getById(orgId, returnId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Return not found');
    }

    assertDraftReturn(existing);

    if (existing.lines.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Return must have at least one product line');
    }

    const completed = await returnRepository.complete(orgId, returnId, userId);
    await dailySummaryService.scheduleRecalculationAfterCommit(orgId, completed.returnDate);
    return completed;
  },
};
