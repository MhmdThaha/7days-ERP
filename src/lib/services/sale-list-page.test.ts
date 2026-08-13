import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saleRepository } from '@/lib/repositories/sale.repository';
import { saleService } from '@/lib/services/sale.service';
import type { SaleListItem, SaleListPageResult, SaleListResult } from '@/types/sale';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/sale.repository', () => ({
  saleRepository: {
    list: vi.fn(),
    listPage: vi.fn(),
  },
  generateSaleLineId: vi.fn(),
}));

vi.mock('@/lib/repositories/product.repository', () => ({
  productRepository: {},
}));

vi.mock('@/lib/services/daily-summary.service', () => ({
  dailySummaryService: {},
}));

function listItem(overrides: Partial<SaleListItem> & Pick<SaleListItem, 'id' | 'saleNumber' | 'saleDate'>): SaleListItem {
  return {
    customerNameSnapshot: overrides.customerNameSnapshot ?? null,
    lineCount: overrides.lineCount ?? 1,
    subtotal: overrides.subtotal ?? 100,
    totalCogs: overrides.totalCogs ?? 0,
    status: overrides.status ?? 'completed',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    id: overrides.id,
    saleNumber: overrides.saleNumber,
    saleDate: overrides.saleDate,
  };
}

describe('saleService.listPage', () => {
  beforeEach(() => {
    vi.mocked(saleRepository.list).mockReset();
    vi.mocked(saleRepository.listPage).mockReset();
  });

  it('uses legacy list() for non-empty substring search', async () => {
    const legacy: SaleListResult = {
      items: [listItem({ id: 's1', saleNumber: 'SAL-010', saleDate: '2026-08-01', customerNameSnapshot: 'Rahul' })],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    };
    vi.mocked(saleRepository.list).mockResolvedValue(legacy);

    const result = await saleService.listPage('org-a', {
      search: 'rah',
      status: 'all',
      page: 1,
      pageSize: 25,
      position: 'first',
    });

    expect(saleRepository.list).toHaveBeenCalledWith('org-a', {
      search: 'rah',
      status: 'all',
      page: 1,
      pageSize: 25,
    });
    expect(saleRepository.listPage).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.id)).toEqual(['s1']);
    expect(result.startCursor).toEqual({ saleDate: '2026-08-01', saleNumber: 'SAL-010' });
    expect(result.endCursor).toEqual({ saleDate: '2026-08-01', saleNumber: 'SAL-010' });
  });

  it('uses listPage for empty search', async () => {
    const pageResult: SaleListPageResult = {
      items: [listItem({ id: 's2', saleNumber: 'SAL-020', saleDate: '2026-08-02' })],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      startCursor: { saleDate: '2026-08-02', saleNumber: 'SAL-020' },
      endCursor: { saleDate: '2026-08-02', saleNumber: 'SAL-020' },
    };
    vi.mocked(saleRepository.listPage).mockResolvedValue(pageResult);

    const result = await saleService.listPage('org-a', {
      search: '   ',
      status: 'draft',
      page: 1,
      pageSize: 25,
      position: 'first',
    });

    expect(saleRepository.list).not.toHaveBeenCalled();
    expect(saleRepository.listPage).toHaveBeenCalledWith('org-a', {
      status: 'draft',
      pageSize: 25,
      page: 1,
      position: 'first',
      cursor: undefined,
    });
    expect(result).toEqual(pageResult);
  });
});

describe('sale listPage pagination invariants (in-memory oracle)', () => {
  function sortSales(items: SaleListItem[]): SaleListItem[] {
    return [...items].sort((a, b) => {
      const dateCompare = b.saleDate.localeCompare(a.saleDate);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return b.saleNumber.localeCompare(a.saleNumber);
    });
  }

  function buildDataset(count: number): SaleListItem[] {
    const items: SaleListItem[] = [];
    for (let i = 1; i <= count; i += 1) {
      const saleNumber = `SAL-${String(i).padStart(3, '0')}`;
      const saleDate = `2026-07-${String(((i - 1) % 28) + 1).padStart(2, '0')}`;
      items.push(
        listItem({
          id: `id-${saleNumber}`,
          saleNumber,
          saleDate,
          status: i % 5 === 0 ? 'draft' : 'completed',
          customerNameSnapshot: i % 7 === 0 ? 'Abraham Bakery' : i % 3 === 0 ? 'Rahul' : 'Kabeer',
        }),
      );
    }
    // Many identical dates: force 40 sales onto one date
    for (let i = 0; i < Math.min(40, items.length); i += 1) {
      items[i] = { ...items[i]!, saleDate: '2026-07-15' };
    }
    return items;
  }

  function paginateOracle(all: SaleListItem[], pageSize: number): string[][] {
    const sorted = sortSales(all);
    const pages: string[][] = [];
    for (let start = 0; start < sorted.length; start += pageSize) {
      pages.push(sorted.slice(start, start + pageSize).map((item) => item.id));
    }
    if (pages.length === 0) {
      pages.push([]);
    }
    return pages;
  }

  function walkWithCursors(all: SaleListItem[], pageSize: number): string[][] {
    const sorted = sortSales(all);
    const pages: string[][] = [];

    // first
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
    'cursor walk matches slice oracle for %s sales',
    (count) => {
      const dataset = buildDataset(count);
      const pageSize = 25;
      const oracle = paginateOracle(dataset, pageSize);
      const walked = walkWithCursors(dataset, pageSize);

      expect(walked).toEqual(oracle);

      const flat = walked.flat();
      expect(new Set(flat).size).toBe(flat.length);
      expect(flat).toEqual(sortSales(dataset).map((item) => item.id));
    },
  );

  it('last page size matches remainder for 51 items', () => {
    const dataset = buildDataset(51);
    const sorted = sortSales(dataset);
    const pageSize = 25;
    const lastPageSize = 51 % pageSize;
    const last = sorted.slice(sorted.length - lastPageSize).map((item) => item.id);
    const ascOldest = [...sorted].reverse().slice(0, lastPageSize).reverse().map((item) => item.id);
    expect(ascOldest).toEqual(last);
  });
});
