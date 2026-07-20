import 'server-only';

import { RETURN_NUMBER_PREFIX } from '@/lib/domain/constants/return';
import { DomainError } from '@/lib/domain/errors';
import { productRepository } from '@/lib/repositories/product.repository';
import { generateReturnLineId, returnRepository } from '@/lib/repositories/return.repository';
import type {
  CreateReturnInput,
  ReturnEntry,
  ReturnLineItem,
  ReturnLineItemInput,
  ReturnListParams,
  ReturnListResult,
  UpdateReturnInput,
} from '@/types/return';

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

async function resolveLineItems(
  orgId: string,
  lines: ReturnLineItemInput[],
): Promise<ReturnLineItem[]> {
  const resolved: ReturnLineItem[] = [];

  for (const line of lines) {
    const product = await productRepository.getById(orgId, line.productId);

    if (!product) {
      throw new DomainError('NOT_FOUND', 'One or more products were not found');
    }

    if (!product.isActive) {
      throw new DomainError('VALIDATION_ERROR', `Product "${product.name}" is inactive`);
    }

    resolved.push({
      id: line.id ?? generateReturnLineId(),
      productId: product.id,
      productNameSnapshot: product.name,
      productCodeSnapshot: product.code,
      quantity: line.quantity,
      unit: product.unit,
    });
  }

  return resolved;
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

  async create(orgId: string, input: CreateReturnInput, userId: string): Promise<ReturnEntry> {
    const returnNumber = await resolveReturnNumber(orgId);
    const lines = await resolveLineItems(orgId, input.lines);
    const totalUnits = calculateTotalUnits(lines);

    return returnRepository.create(
      orgId,
      {
        returnNumber,
        returnDate: input.returnDate,
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
      lines = await resolveLineItems(orgId, input.lines);
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

    return returnRepository.complete(orgId, returnId, userId);
  },
};
