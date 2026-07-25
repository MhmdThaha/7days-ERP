'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, SearchX } from 'lucide-react';

import { formatPreviewValue } from '@/components/import/preview-format';
import { RowStatusBadge } from '@/components/import/row-status-badge';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  ColumnDefinition,
  RowStatus,
  ValidatedRow,
} from '@/lib/import/engine/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

type StatusFilter = 'all' | RowStatus;

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'valid', label: 'Ready' },
  { key: 'warning', label: 'Warnings' },
  { key: 'error', label: 'Errors' },
];

type PreviewTableProps = {
  rows: readonly ValidatedRow[];
  /** Mapped target columns, in definition order; becomes table columns. */
  columns: readonly ColumnDefinition[];
  onRowSelect: (row: ValidatedRow) => void;
};

/** Filterable, paginated preview of every parsed row. */
export function PreviewTable({ rows, columns, onRowSelect }: PreviewTableProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const byStatus = { valid: 0, warning: 0, error: 0 };

    for (const row of rows) {
      byStatus[row.status] += 1;
    }

    return { all: rows.length, ...byStatus };
  }, [rows]);

  const filteredRows = useMemo(
    () => (filter === 'all' ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-3">
      {/* Status filter */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rows by status">
        {FILTERS.map((entry) => {
          const isActive = entry.key === filter;
          const count = counts[entry.key];

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
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No rows match this filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="py-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-16 text-right">Row</TableHead>
                    {columns.map((column) => (
                      <TableHead
                        key={column.field}
                        className={cn(
                          ['number', 'money', 'percent'].includes(column.dataType) &&
                            'text-right',
                        )}
                      >
                        {column.label}
                      </TableHead>
                    ))}
                    <TableHead className="w-10">
                      <span className="sr-only">Details</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className="cursor-pointer"
                      onClick={() => onRowSelect(row)}
                    >
                      <TableCell>
                        <RowStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {row.rowNumber}
                      </TableCell>
                      {columns.map((column) => (
                        <TableCell
                          key={column.field}
                          className={cn(
                            'max-w-48 truncate',
                            ['number', 'money', 'percent'].includes(column.dataType) &&
                              'text-right tabular-nums',
                          )}
                        >
                          {formatPreviewValue(row.values[column.field], column.dataType)}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Show details for row ${row.rowNumber}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRowSelect(row);
                          }}
                        >
                          <ChevronRight />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {filteredRows.length > PAGE_SIZE ? (
            <DataTablePagination
              page={safePage}
              totalPages={totalPages}
              total={filteredRows.length}
              pageSize={PAGE_SIZE}
              entityName="rows"
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
