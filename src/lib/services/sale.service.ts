import 'server-only';

import { SALE_NUMBER_PREFIX } from '@/lib/domain/constants/sale';
import { DomainError } from '@/lib/domain/errors';
import { productRepository } from '@/lib/repositories/product.repository';
import { generateSaleLineId, saleRepository } from '@/lib/repositories/sale.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  CreateSaleInput,
  Sale,
  SaleLineItem,
  SaleLineItemInput,
  SaleListParams,
  SaleListResult,
  UpdateSaleInput,
} from '@/types/sale';

function formatGeneratedNumber(sequence: number): string {
  return `${SALE_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

function calculateLineTotal(quantity: number, sellingPrice: number): number {
  return Math.round(quantity * sellingPrice);
}

function calculateSubtotal(lines: SaleLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

async function resolveSaleNumber(orgId: string): Promise<string> {
  const highest = await saleRepository.getHighestSaleNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedNumber(next);

  while (await saleRepository.findBySaleNumber(orgId, generated)) {
    next += 1;
    generated = formatGeneratedNumber(next);
  }

  return generated;
}

async function resolveLineItems(orgId: string, lines: SaleLineItemInput[]): Promise<SaleLineItem[]> {
  const resolved: SaleLineItem[] = [];

  for (const line of lines) {
    const product = await productRepository.getById(orgId, line.productId);

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

  async getById(orgId: string, saleId: string): Promise<Sale> {
    const sale = await saleRepository.getById(orgId, saleId);

    if (!sale) {
      throw new DomainError('NOT_FOUND', 'Sale not found');
    }

    return sale;
  },

  async create(orgId: string, input: CreateSaleInput, userId: string): Promise<Sale> {
    const saleNumber = await resolveSaleNumber(orgId);
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

  async complete(orgId: string, saleId: string, userId: string): Promise<Sale> {
    const existing = await saleRepository.getById(orgId, saleId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Sale not found');
    }

    assertDraftSale(existing);

    if (existing.lines.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Sale must have at least one product line');
    }

    const completed = await saleRepository.complete(orgId, saleId, userId);
    await dailySummaryService.recalculate(orgId, completed.saleDate);
    return completed;
  },
};
