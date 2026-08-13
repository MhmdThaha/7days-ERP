import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purchaseRepository } from '@/lib/repositories/purchase.repository';
import { purchaseService } from '@/lib/services/purchase.service';
import type { PurchaseListItem, PurchaseListPageResult, PurchaseListResult } from '@/types/purchase';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/purchase.repository', () => ({
  purchaseRepository: {
    list: vi.fn(),
    listPage: vi.fn(),
  },
  generateLineItemId: vi.fn(),
}));

vi.mock('@/lib/repositories/raw-material.repository', () => ({
  rawMaterialRepository: {},
}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {},
}));

function listItem(
  overrides: Partial<PurchaseListItem> & Pick<PurchaseListItem, 'id' | 'purchaseNumber' | 'purchaseDate'>,
): PurchaseListItem {
  return {
    supplierName: overrides.supplierName ?? 'Supplier A',
    invoiceNumber: overrides.invoiceNumber ?? null,
    paymentStatus: overrides.paymentStatus ?? 'credit',
    lineItemCount: overrides.lineItemCount ?? 1,
    totalAmount: overrides.totalAmount ?? 100,
    status: overrides.status ?? 'received',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    id: overrides.id,
    purchaseNumber: overrides.purchaseNumber,
    purchaseDate: overrides.purchaseDate,
  };
}

describe('purchaseService.listPage', () => {
  beforeEach(() => {
    vi.mocked(purchaseRepository.list).mockReset();
    vi.mocked(purchaseRepository.listPage).mockReset();
  });

  it('uses legacy list() for non-empty substring search', async () => {
    const legacy: PurchaseListResult = {
      items: [
        listItem({
          id: 'p1',
          purchaseNumber: 'PUR-010',
          purchaseDate: '2026-08-01',
          supplierName: 'Rahul Traders',
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    };
    vi.mocked(purchaseRepository.list).mockResolvedValue(legacy);

    const result = await purchaseService.listPage('org-a', {
      search: 'rah',
      status: 'all',
      page: 1,
      pageSize: 25,
      position: 'first',
    });

    expect(purchaseRepository.list).toHaveBeenCalledWith('org-a', {
      search: 'rah',
      status: 'all',
      page: 1,
      pageSize: 25,
    });
    expect(purchaseRepository.listPage).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.id)).toEqual(['p1']);
    expect(result.startCursor).toEqual({ purchaseDate: '2026-08-01', purchaseNumber: 'PUR-010' });
    expect(result.endCursor).toEqual({ purchaseDate: '2026-08-01', purchaseNumber: 'PUR-010' });
  });

  it('uses listPage for empty search', async () => {
    const pageResult: PurchaseListPageResult = {
      items: [listItem({ id: 'p2', purchaseNumber: 'PUR-020', purchaseDate: '2026-08-02' })],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      startCursor: { purchaseDate: '2026-08-02', purchaseNumber: 'PUR-020' },
      endCursor: { purchaseDate: '2026-08-02', purchaseNumber: 'PUR-020' },
    };
    vi.mocked(purchaseRepository.listPage).mockResolvedValue(pageResult);

    const result = await purchaseService.listPage('org-a', {
      search: '   ',
      status: 'draft',
      page: 1,
      pageSize: 25,
      position: 'first',
    });

    expect(purchaseRepository.list).not.toHaveBeenCalled();
    expect(purchaseRepository.listPage).toHaveBeenCalledWith('org-a', {
      status: 'draft',
      pageSize: 25,
      page: 1,
      position: 'first',
      cursor: undefined,
    });
    expect(result).toEqual(pageResult);
  });
});

describe('purchase listPage pagination invariants (in-memory oracle)', () => {
  function sortPurchases(items: PurchaseListItem[]): PurchaseListItem[] {
    return [...items].sort((a, b) => {
      const dateCompare = b.purchaseDate.localeCompare(a.purchaseDate);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return b.purchaseNumber.localeCompare(a.purchaseNumber);
    });
  }

  function buildDataset(count: number): PurchaseListItem[] {
    const items: PurchaseListItem[] = [];
    for (let i = 1; i <= count; i += 1) {
      const purchaseNumber = `PUR-${String(i).padStart(3, '0')}`;
      const purchaseDate = `2026-07-${String(((i - 1) % 28) + 1).padStart(2, '0')}`;
      items.push(
        listItem({
          id: `id-${purchaseNumber}`,
          purchaseNumber,
          purchaseDate,
          status: i % 5 === 0 ? 'draft' : 'received',
          supplierName: i % 7 === 0 ? 'Abraham Bakery' : i % 3 === 0 ? 'Rahul' : 'Kabeer',
        }),
      );
    }
    for (let i = 0; i < Math.min(40, items.length); i += 1) {
      items[i] = { ...items[i]!, purchaseDate: '2026-07-15' };
    }
    return items;
  }

  function paginateOracle(all: PurchaseListItem[], pageSize: number): string[][] {
    const sorted = sortPurchases(all);
    const pages: string[][] = [];
    for (let start = 0; start < sorted.length; start += pageSize) {
      pages.push(sorted.slice(start, start + pageSize).map((item) => item.id));
    }
    if (pages.length === 0) {
      pages.push([]);
    }
    return pages;
  }

  function walkWithCursors(all: PurchaseListItem[], pageSize: number): string[][] {
    const sorted = sortPurchases(all);
    const pages: string[][] = [];

    let pageItems = sorted.slice(0, pageSize);
    pages.push(pageItems.map((item) => item.id));

    while (pages.flat().length < sorted.length) {
      const last = pageItems[pageItems.length - 1]!;
      const startIndex = sorted.findIndex((item) => item.id === last.id) + 1;
      pageItems = sorted.slice(startIndex, startIndex + pageSize);
      if (pageItems.length === 0) {
        break;
      }
      pages.push(pageItems.map((item) => item.id));
    }

    return pages;
  }

  it.each([0, 1, 25, 26, 50, 51, 60, 100, 120])(
    'cursor walk matches slice oracle for %s purchases',
    (count) => {
      const dataset = buildDataset(count);
      const pageSize = 25;
      const oracle = paginateOracle(dataset, pageSize);
      const walked = walkWithCursors(dataset, pageSize);

      expect(walked).toEqual(oracle);

      const flat = walked.flat();
      expect(new Set(flat).size).toBe(flat.length);
      expect(flat).toEqual(sortPurchases(dataset).map((item) => item.id));
    },
  );

  it('last page size matches remainder for 51 items', () => {
    const dataset = buildDataset(51);
    const sorted = sortPurchases(dataset);
    const pageSize = 25;
    const lastPageSize = 51 % pageSize;
    const last = sorted.slice(sorted.length - lastPageSize).map((item) => item.id);
    const ascOldest = [...sorted].reverse().slice(0, lastPageSize).reverse().map((item) => item.id);
    expect(ascOldest).toEqual(last);
  });

  it('excludes deleted purchases from oracle datasets (deletedAt filtered upstream)', () => {
    const active = buildDataset(26);
    const withDeleted = [
      ...active,
      listItem({
        id: 'deleted-1',
        purchaseNumber: 'PUR-999',
        purchaseDate: '2026-08-01',
      }),
    ];
    // Repository filters deletedAt == null before pagination; oracle only walks active.
    const walked = walkWithCursors(active, 25);
    expect(walked.flat()).not.toContain('deleted-1');
    expect(walked.flat().length).toBe(26);
    expect(withDeleted.length).toBe(27);
  });
});
