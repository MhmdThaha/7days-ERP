import 'server-only';

import { DomainError } from '@/lib/domain/errors';
import { productRepository } from '@/lib/repositories/product.repository';
import { generateSaleLineId, saleRepository } from '@/lib/repositories/sale.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  CreateSaleInput,
  Sale,
  SaleLineItem,
  SaleLineItemInput,
  SaleListPageParams,
  SaleListPageResult,
  SaleListParams,
  SaleListResult,
  UpdateSaleInput,
} from '@/types/sale';

function calculateLineTotal(quantity: number, sellingPrice: number): number {
  return Math.round(quantity * sellingPrice);
}

function calculateSubtotal(lines: SaleLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

async function resolveLineItems(orgId: string, lines: SaleLineItemInput[]): Promise<SaleLineItem[]> {
  const uniqueProductIds = [...new Set(lines.map((line) => line.productId).filter(Boolean))];
  const products =
    uniqueProductIds.length === 0
      ? []
      : await productRepository.getByIds(orgId, uniqueProductIds);
  const productsById = new Map(products.map((product) => [product.id, product]));

  const resolved: SaleLineItem[] = [];

  for (const line of lines) {
    const product = productsById.get(line.productId);

    if (!product) {
      throw new DomainError('NOT_FOUND', 'One or more products were not found');
    }

    if (!product.isActive) {
      throw new DomainError('VALIDATION_ERROR', `Product "${product.name}" is inactive`);
    }

    resolved.push({
      id: line.id ?? generateSaleLineId(),
      productId: product.id,
      productNameSnapshot: product.name,
      productCodeSnapshot: product.code,
      sellingPriceSnapshot: line.sellingPrice,
      quantity: line.quantity,
      unit: product.unit,
      lineTotal: calculateLineTotal(line.quantity, line.sellingPrice),
      unitCost: 0,
      cogs: 0,
    });
  }

  return resolved;
}

function assertDraftSale(sale: Sale): void {
  if (sale.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft sales can be modified');
  }
}

export const saleService = {
  async list(orgId: string, params: SaleListParams): Promise<SaleListResult> {
    return saleRepository.list(orgId, params);
  },

  /**
   * Sales page retrieval: empty search → Firestore listPage; non-empty search → legacy list()
   * substring semantics (unchanged).
   */
  async listPage(orgId: string, params: SaleListPageParams): Promise<SaleListPageResult> {
    const search = params.search?.trim() ?? '';

    if (search) {
      const result = await saleRepository.list(orgId, {
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
          ? { saleDate: first.saleDate, saleNumber: first.saleNumber }
          : null,
        endCursor: last ? { saleDate: last.saleDate, saleNumber: last.saleNumber } : null,
      };
    }

    return saleRepository.listPage(orgId, {
      status: params.status,
      pageSize: params.pageSize,
      page: params.page,
      position: params.position,
      cursor: params.cursor,
    });
  },

  async getById(orgId: string, saleId: string): Promise<Sale> {
    const sale = await saleRepository.getById(orgId, saleId);

    if (!sale) {
      throw new DomainError('NOT_FOUND', 'Sale not found');
    }

    return sale;
  },

  async create(
    orgId: string,
    input: CreateSaleInput,
    userId: string,
    options?: { importSource?: { importId: string; groupKey: string } },
  ): Promise<Sale> {
    const saleNumber = input.saleNumber?.trim().toUpperCase() || undefined;

    if (saleNumber && !options?.importSource) {
      const existing = await saleRepository.findBySaleNumber(orgId, saleNumber);

      if (existing) {
        throw new DomainError('VALIDATION_ERROR', 'Sale number already exists');
      }
    }

    const lines = await resolveLineItems(orgId, input.lines);
    const subtotal = calculateSubtotal(lines);

    return saleRepository.create(
      orgId,
      {
        saleNumber,
        saleDate: input.saleDate,
        customerNameSnapshot: input.customerName ?? null,
        lines,
        subtotal,
        notes: input.notes,
        importSource: options?.importSource,
      },
      userId,
    );
  },

  async update(
    orgId: string,
    saleId: string,
    input: UpdateSaleInput,
    userId: string,
  ): Promise<Sale> {
    const existing = await saleRepository.getById(orgId, saleId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Sale not found');
    }

    assertDraftSale(existing);

    let lines = existing.lines;
    let subtotal = existing.subtotal;

    if (input.lines) {
      lines = await resolveLineItems(orgId, input.lines);
      subtotal = calculateSubtotal(lines);
    }

    return saleRepository.update(
      orgId,
      saleId,
      {
        saleDate: input.saleDate,
        customerNameSnapshot: input.customerName ?? null,
        lines: input.lines ? lines : undefined,
        subtotal: input.lines ? subtotal : undefined,
        notes: input.notes,
      },
      userId,
    );
  },

  async softDelete(orgId: string, saleId: string, userId: string): Promise<void> {
    const existing = await saleRepository.getById(orgId, saleId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Sale not found');
    }

    assertDraftSale(existing);

    await saleRepository.softDelete(orgId, saleId, userId);
  },

  async complete(
    orgId: string,
    saleId: string,
    userId: string,
    options?: { deferSummaryRebuild?: boolean },
  ): Promise<Sale> {
    const existing = await saleRepository.getById(orgId, saleId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Sale not found');
    }

    assertDraftSale(existing);

    if (existing.lines.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Sale must have at least one product line');
    }

    const completed = await saleRepository.complete(orgId, saleId, userId);

    if (options?.deferSummaryRebuild) {
      await dailySummaryService.markDirtyAfterCommit(orgId, completed.saleDate);
    } else {
      await dailySummaryService.scheduleRecalculationAfterCommit(orgId, completed.saleDate);
    }

    return completed;
  },
};
