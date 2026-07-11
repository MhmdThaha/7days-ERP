import 'server-only';

import { RAW_MATERIAL_CODE_PREFIX } from '@/lib/domain/constants/raw-material';
import { DomainError } from '@/lib/domain/errors';
import { rawMaterialRepository } from '@/lib/repositories/raw-material.repository';
import type {
  CreateRawMaterialInput,
  RawMaterial,
  RawMaterialListParams,
  RawMaterialListResult,
  UpdateRawMaterialInput,
} from '@/types/raw-material';

function formatGeneratedCode(sequence: number): string {
  return `${RAW_MATERIAL_CODE_PREFIX}-${String(sequence).padStart(3, '0')}`;
}

async function resolveUniqueCode(
  orgId: string,
  code: string | undefined,
  excludeId?: string,
): Promise<string> {
  if (code && code.trim().length > 0) {
    const normalized = code.trim().toUpperCase();
    const existing = await rawMaterialRepository.findByCode(orgId, normalized, excludeId);

    if (existing) {
      throw new DomainError('DUPLICATE_CODE', 'Code already in use');
    }

    return normalized;
  }

  const highest = await rawMaterialRepository.getHighestCodeNumber(orgId);
  let next = highest + 1;
  let generated = formatGeneratedCode(next);

  while (await rawMaterialRepository.findByCode(orgId, generated, excludeId)) {
    next += 1;
    generated = formatGeneratedCode(next);
  }

  return generated;
}

async function assertUniqueName(
  orgId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await rawMaterialRepository.findByName(orgId, name, excludeId);

  if (existing) {
    throw new DomainError('DUPLICATE_NAME', 'Raw material name already exists');
  }
}

export const rawMaterialService = {
  async list(orgId: string, params: RawMaterialListParams): Promise<RawMaterialListResult> {
    return rawMaterialRepository.list(orgId, params);
  },

  async getById(orgId: string, rawMaterialId: string): Promise<RawMaterial> {
    const rawMaterial = await rawMaterialRepository.getById(orgId, rawMaterialId);

    if (!rawMaterial) {
      throw new DomainError('NOT_FOUND', 'Raw material not found');
    }

    return rawMaterial;
  },

  async create(
    orgId: string,
    input: CreateRawMaterialInput,
    userId: string,
  ): Promise<RawMaterial> {
    await assertUniqueName(orgId, input.name);

    const code = await resolveUniqueCode(orgId, input.code);

    return rawMaterialRepository.create(
      orgId,
      {
        ...input,
        code,
      },
      userId,
    );
  },

  async update(
    orgId: string,
    rawMaterialId: string,
    input: UpdateRawMaterialInput,
    userId: string,
  ): Promise<RawMaterial> {
    const existing = await rawMaterialRepository.getById(orgId, rawMaterialId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Raw material not found');
    }

    if (
      input.name &&
      input.name.trim().toLowerCase() !== existing.name.trim().toLowerCase()
    ) {
      await assertUniqueName(orgId, input.name, rawMaterialId);
    }

    if (input.code !== undefined) {
      const resolvedCode = await resolveUniqueCode(orgId, input.code, rawMaterialId);
      input = { ...input, code: resolvedCode };
    }

    return rawMaterialRepository.update(orgId, rawMaterialId, input, userId);
  },

  async softDelete(orgId: string, rawMaterialId: string, userId: string): Promise<void> {
    const existing = await rawMaterialRepository.getById(orgId, rawMaterialId);

    if (!existing) {
      throw new DomainError('NOT_FOUND', 'Raw material not found');
    }

    await rawMaterialRepository.softDelete(orgId, rawMaterialId, userId);
  },
};
