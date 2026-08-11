'use client';

import { Fragment, useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

import { formatPreviewValue } from '@/components/import/preview-format';
import { formatPreparedCustomerNameForReview } from '@/lib/import/preparation/sales-customer-semantics';
import { formatPreparedInvoiceNumberForReview } from '@/lib/import/preparation/sales-invoice-semantics';
import { ConfidenceBadge } from '@/components/import/review/confidence-badge';
import { ImportReviewNoFilterMatchesState } from '@/components/import/review/import-review-empty-states';
import {
  ImportReviewRowDetail,
  rowHasMultipleProducts,
  rowHasUnknownProduct,
} from '@/components/import/review/import-review-row-detail';
import {
  ReviewStatusBadge,
  reviewStatusSortKey,
} from '@/components/import/review/review-status-badge';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ImportReviewRowViewModel } from '@/lib/import/review/types';
import {
  getProductResolutionActionLabel,
  getReviewProductMatchDisplay,
} from '@/lib/import/resolution';
import { AUTO_IMPORT_RECOMMENDATION } from '@/lib/import/services/confidence-engine.service';
import {
  CONFLICT_ENGINE_STATUS,
  type ConflictEngineStatus,
} from '@/lib/import/services/conflict-engine.service';
import { CONFIDENCE_LEVEL } from '@/lib/import/services/confidence-engine.service';
import { cn } from '@/lib/utils';

export const IMPORT_REVIEW_PAGE_SIZE = 50;

export type ImportReviewResolutionHandlers = {
  onResolve: (row: ImportReviewRowViewModel) => void;
  needsResolution: (row: ImportReviewRowViewModel) => boolean;
  isReadOnly: (row: ImportReviewRowViewModel) => boolean;
};

type RowFilter =
  | 'all'
  | ConflictEngineStatus
  | 'unknown-products'
  | 'multiple-matches'
  | 'low-confidence'
  | 'high-confidence';

type SortKey = 'rowNumber' | 'confidence' | 'status' | 'customer' | 'product';

const FILTERS: { key: RowFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: CONFLICT_ENGINE_STATUS.READY, label: 'Ready' },
  { key: CONFLICT_ENGINE_STATUS.WARNING, label: 'Warnings' },
  { key: CONFLICT_ENGINE_STATUS.ERROR, label: 'Errors' },
  { key: 'unknown-products', label: 'Unknown products' },
  { key: 'multiple-matches', label: 'Multiple matches' },
  { key: 'low-confidence', label: 'Low confidence' },
  { key: 'high-confidence', label: 'High confidence' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'rowNumber', label: 'Row number' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'status', label: 'Status' },
  { key: 'customer', label: 'Customer' },
  { key: 'product', label: 'Product' },
];

const RECOMMENDATION_SHORT = {
  [AUTO_IMPORT_RECOMMENDATION.AUTO_IMPORT]: 'Auto',
  [AUTO_IMPORT_RECOMMENDATION.PREVIEW_FIRST]: 'Preview',
  [AUTO_IMPORT_RECOMMENDATION.USER_CONFIRMATION]: 'Confirm',
  [AUTO_IMPORT_RECOMMENDATION.BLOCK_IMPORT]: 'Block',
} as const;

type ImportReviewRowTableProps = {
  rows: readonly ImportReviewRowViewModel[];
  resolution?: ImportReviewResolutionHandlers;
};

function readCell(row: ImportReviewRowViewModel, field: string): string {
  const value = row.normalizedValues[field];

  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }

  return String(value).toLowerCase();
}

function displayCell(row: ImportReviewRowViewModel, field: string): string {
  const value = row.normalizedValues[field];

  if (field === 'customerName') {
    return formatPreparedCustomerNameForReview(
      value,
      row.preparedFieldSources?.customerName === 'defaulted' ? 'defaulted' : undefined,
    );
  }

  if (field === 'saleNumber') {
    return formatPreparedInvoiceNumberForReview(
      value,
      row.preparedFieldSources?.saleNumber === 'defaulted' ? 'defaulted' : undefined,
    );
  }

  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return formatPreviewValue(value, field === 'quantity' || field === 'amount' ? 'number' : 'string');
}

function matchesFilter(row: ImportReviewRowViewModel, filter: RowFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unknown-products':
      return rowHasUnknownProduct(row);
    case 'multiple-matches':
      return rowHasMultipleProducts(row);
    case 'low-confidence':
      return (
        row.confidenceResult.confidenceLevel === CONFIDENCE_LEVEL.LOW ||
        row.confidenceResult.confidenceLevel === CONFIDENCE_LEVEL.VERY_LOW
      );
    case 'high-confidence':
      return (
        row.confidenceResult.confidenceLevel === CONFIDENCE_LEVEL.HIGH ||
        row.confidenceResult.confidenceLevel === CONFIDENCE_LEVEL.VERY_HIGH
      );
    default:
      return row.conflictEngineResult.status === filter;
  }
}

function matchesSearch(row: ImportReviewRowViewModel, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    readCell(row, 'customerName'),
    readCell(row, 'productName'),
    readCell(row, 'productCode'),
    readCell(row, 'saleNumber'),
  ].join(' ');

  return haystack.includes(query);
}

function compareRows(a: ImportReviewRowViewModel, b: ImportReviewRowViewModel, sortKey: SortKey): number {
  switch (sortKey) {
    case 'confidence':
      return b.confidenceResult.confidenceScore - a.confidenceResult.confidenceScore;
    case 'status':
      return (
        reviewStatusSortKey(a.conflictEngineResult.status) -
        reviewStatusSortKey(b.conflictEngineResult.status)
      );
    case 'customer':
      return readCell(a, 'customerName').localeCompare(readCell(b, 'customerName'));
    case 'product':
      return readCell(a, 'productName').localeCompare(readCell(b, 'productName'));
    default:
      return a.rowNumber - b.rowNumber;
  }
}

/** Section 3 — searchable, filterable, paginated row review table. */
export function ImportReviewRowTable({ rows, resolution }: ImportReviewRowTableProps) {
  const [filter, setFilter] = useState<RowFilter>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rowNumber');
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const normalizedSearch = search.trim().toLowerCase();

  const filterCounts = useMemo(() => {
    const counts: Record<RowFilter, number> = {
      all: rows.length,
      [CONFLICT_ENGINE_STATUS.READY]: 0,
      [CONFLICT_ENGINE_STATUS.WARNING]: 0,
      [CONFLICT_ENGINE_STATUS.ERROR]: 0,
      'unknown-products': 0,
      'multiple-matches': 0,
      'low-confidence': 0,
      'high-confidence': 0,
    };

    for (const row of rows) {
      for (const entry of FILTERS) {
        if (entry.key !== 'all' && matchesFilter(row, entry.key)) {
          counts[entry.key] += 1;
        }
      }
    }

    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const next = rows.filter(
      (row) => matchesFilter(row, filter) && matchesSearch(row, normalizedSearch),
    );

    return [...next].sort((a, b) => compareRows(a, b, sortKey));
  }, [rows, filter, normalizedSearch, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / IMPORT_REVIEW_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () =>
      filteredRows.slice(
        (safePage - 1) * IMPORT_REVIEW_PAGE_SIZE,
        safePage * IMPORT_REVIEW_PAGE_SIZE,
      ),
    [filteredRows, safePage],
  );

  const toggleExpanded = useCallback((rowNumber: number) => {
    setExpandedRow((current) => (current === rowNumber ? null : rowNumber));
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search customer, product, code, or invoice…"
            aria-label="Search rows"
            className="pl-9"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort by</span>
          <select
            className="rounded-md border bg-background px-2 py-1.5"
            value={sortKey}
            aria-label="Sort rows"
            onChange={(event) => {
              setSortKey(event.target.value as SortKey);
              setPage(1);
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rows">
        {FILTERS.map((entry) => {
          const isActive = entry.key === filter;
          const count = filterCounts[entry.key];

          return (
            <Button
              key={entry.key}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              aria-pressed={isActive}
              onClick={() => {
                setFilter(entry.key);
                setPage(1);
              }}
            >
              {entry.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  isActive ? 'bg-primary-foreground/20' : 'bg-muted',
                )}
              >
                {count.toLocaleString('en-IN')}
              </span>
            </Button>
          );
        })}
      </div>

      {filteredRows.length === 0 ? (
        <ImportReviewNoFilterMatchesState />
      ) : (
        <>
          <Card className="py-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <span className="sr-only">Expand</span>
                    </TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-16 text-right">Row</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>BakeryOS product</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Recommendation</TableHead>
                    {resolution ? (
                      <TableHead className="w-28">
                        <span className="sr-only">Resolve</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row) => {
                    const isExpanded = expandedRow === row.rowNumber;
                    const productDisplay = getReviewProductMatchDisplay(row);

                    return (
                      <Fragment key={row.rowNumber}>
                        <TableRow
                          className="cursor-pointer"
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpanded(row.rowNumber)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              toggleExpanded(row.rowNumber);
                            }
                          }}
                          tabIndex={0}
                        >
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={isExpanded ? 'Collapse row details' : 'Expand row details'}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleExpanded(row.rowNumber);
                              }}
                            >
                              {isExpanded ? <ChevronDown /> : <ChevronRight />}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <ReviewStatusBadge status={row.conflictEngineResult.status} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {row.rowNumber}
                          </TableCell>
                          <TableCell className="max-w-40 truncate">
                            {displayCell(row, 'customerName')}
                          </TableCell>
                          <TableCell className="max-w-48 truncate">
                            {displayCell(row, 'productName')}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {displayCell(row, 'quantity')}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground">{productDisplay.label}</p>
                              <p
                                className={cn(
                                  'truncate font-medium',
                                  productDisplay.kind === 'suggested' && 'text-warning-foreground',
                                  productDisplay.kind === 'not-found' && 'text-destructive',
                                )}
                              >
                                {productDisplay.value}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <ConfidenceBadge
                              level={row.confidenceResult.confidenceLevel}
                              score={row.confidenceResult.confidenceScore}
                            />
                          </TableCell>
                          <TableCell>
                            {RECOMMENDATION_SHORT[row.confidenceResult.autoImportRecommendation]}
                          </TableCell>
                          {resolution ? (
                            <TableCell>
                              {resolution.needsResolution(row) || resolution.isReadOnly(row) ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    resolution.onResolve(row);
                                  }}
                                >
                                  {resolution.isReadOnly(row)
                                    ? 'View issue'
                                    : getProductResolutionActionLabel(row)}
                                </Button>
                              ) : null}
                            </TableCell>
                          ) : null}
                        </TableRow>
                        {isExpanded ? (
                          <TableRow key={`${row.rowNumber}-detail`}>
                            <TableCell colSpan={resolution ? 10 : 9} className="p-0">
                              <ImportReviewRowDetail row={row} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {filteredRows.length > IMPORT_REVIEW_PAGE_SIZE ? (
            <DataTablePagination
              page={safePage}
              totalPages={totalPages}
              total={filteredRows.length}
              pageSize={IMPORT_REVIEW_PAGE_SIZE}
              entityName="rows"
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export { matchesFilter, matchesSearch, compareRows };
