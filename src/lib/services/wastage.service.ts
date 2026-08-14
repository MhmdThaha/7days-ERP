import 'server-only';

import { WASTAGE_NUMBER_PREFIX } from '@/lib/domain/constants/wastage';
import { DomainError } from '@/lib/domain/errors';
import { productRepository } from '@/lib/repositories/product.repository';
import { generateWastageLineId, wastageRepository } from '@/lib/repositories/wastage.repository';
import { dailySummaryService } from '@/lib/services/daily-summary.service';
import type {
  CreateWastageInput,
  UpdateWastageInput,
  Wastage,
  WastageLineItem,
  WastageLineItemInput,
  WastageListParams,
  WastageListResult,
} from '@/types/wastage';

function formatGeneratedNumber(sequence: number): string {
  return `${WASTAGE_NUMBER_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

function calculateTotalUnits(lines: WastageLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

async function resolveWastageNumber(orgId: string): Promise<string> {
  const highest = await wastageRepository.getHighestWastageNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedNumber(next);

  while (await wastageRepository.findByWastageNumber(orgId, generated)) {
    next += 1;
    generated = formatGeneratedNumber(next);
  }

  return generated;
}

async function resolveLineItems(
  orgId: string,
  lines: WastageLineItemInput[],
): Promise<WastageLineItem[]> {
  const resolved: WastageLineItem[] = [];

  for (const line of lines) {
    const product = await productRepository.getById(orgId, line.productId);

    if (!product) {
      throw new DomainError('NOT_FOUND', 'One or more products were not found');
    }

    if (!product.isActive) {
      throw new DomainError('VALIDATION_ERROR', `Product "${product.name}" is inactive`);
    }

    resolved.push({
      id: line.id ?? generateWastageLineId(),
      productId: product.id,
      productNameSnapshot: product.name,
      productCodeSnapshot: product.code,
      quantity: line.quantity,
      unit: product.unit,
      unitCost: 0,
      estimatedCost: 0,
    });
  }

  return resolved;
}

function assertDraftWastage(wastage: Wastage): void {
  if (wastage.status !== 'draft') {
    throw new DomainError('VALIDATION_ERROR', 'Only draft wastage entries can be modified');
  }
}

export const wastageService = {
  async list(orgId: string, params: WastageListParams): Promise<WastageListResult> {
    return wastageRepository.list(orgId, params);
  },

  async getById(orgId: string, wastageId: string): Promise<Wastage> {
    const wastage = await wastageRepository.getById(orgId, wastageId);

    if (!wastage) {
      throw new DomainError('NOT_FOUND', 'Wastage entry not found');
    }

    return wastage;
  },

  async create(orgId: string, input: CreateWastageInput, userId: string): Promise<Wastage> {
    const wastageNumber = await resolveWastageNumber(orgId);
    const lines = await resolveLineItems(orgId, input.lines);
    const totalUnits = calculateTotalUnits(lines);

    return wastageRepository.create(
      orgId,
      {
        wastageNumber,
        wastageDate: input.wastageDate,
        reason: input.reason,
        lines,
        totalUnits,
        notes: input.notes,
      },
      userId,
    );
  },

  async update(
    orgId: string,
    wastageId: string,
    input: UpdateWastageInput,
    userId: string,
  ): Promise<Wastage> {
    const existing = await wastageRepository.getById(orgId, wastageId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Wastage entry not found');
    }

    assertDraftWastage(existing);

    let lines = existing.lines;
    let totalUnits = existing.totalUnits;

    if (input.lines) {
      lines = await resolveLineItems(orgId, input.lines);
      totalUnits = calculateTotalUnits(lines);
    }

    return wastageRepository.update(
      orgId,
      wastageId,
      {
        wastageDate: input.wastageDate,
        reason: input.reason,
        lines: input.lines ? lines : undefined,
        totalUnits: input.lines ? totalUnits : undefined,
        notes: input.notes,
      },
      userId,
    );
  },

  async softDelete(orgId: string, wastageId: string, userId: string): Promise<void> {
    const existing = await wastageRepository.getById(orgId, wastageId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Wastage entry not found');
    }

    assertDraftWastage(existing);

    await wastageRepository.softDelete(orgId, wastageId, userId);
  },

  async complete(orgId: string, wastageId: string, userId: string): Promise<Wastage> {
    const existing = await wastageRepository.getById(orgId, wastageId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Wastage entry not found');
    }

    assertDraftWastage(existing);

    if (existing.lines.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Wastage must have at least one product line');
    }

    const completed = await wastageRepository.complete(orgId, wastageId, userId);
    await dailySummaryService.recalculateAfterMutation(orgId, completed.wastageDate);
    return completed;
  },
};
