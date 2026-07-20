'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Wheat } from 'lucide-react';

import { StockStatusBadge } from '@/components/shared/stock-status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { StockOverviewRawMaterialItem } from '@/types/stock-overview';

type StockOverviewRawMaterialsSectionProps = {
  rawMaterials: StockOverviewRawMaterialItem[];
};

function formatStock(value: number, unit: string): string {
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

function formatReorderLevel(reorderLevel: number | null, unit: string): string {
  if (reorderLevel === null) {
    return '—';
  }

  return `${reorderLevel.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit}`;
}

function matchesSearch(material: StockOverviewRawMaterialItem, search: string): boolean {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return (
    material.name.toLowerCase().includes(term) || material.code.toLowerCase().includes(term)
  );
}

export function StockOverviewRawMaterialsSection({
  rawMaterials,
}: StockOverviewRawMaterialsSectionProps) {
  const [search, setSearch] = useState('');

  const filteredMaterials = useMemo(
    () => rawMaterials.filter((material) => matchesSearch(material, search)),
    [rawMaterials, search],
  );

  return (
    <section aria-labelledby="stock-overview-raw-materials-heading">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle id="stock-overview-raw-materials-heading" className="flex items-center gap-2">
            <Wheat className="size-4 text-muted-foreground" aria-hidden="true" />
            Raw Materials
          </CardTitle>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search raw materials..."
              className="pl-9"
              aria-label="Search raw materials"
            />
          </div>
        </CardHeader>
        <CardContent>
          {rawMaterials.length === 0 ? (
            <EmptyState
              title="No active raw materials"
              description="Add raw materials to track ingredient stock."
              icon={Wheat}
            />
          ) : filteredMaterials.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No raw materials match your search.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Raw Material</TableHead>
                    <TableHead className="hidden sm:table-cell">Code</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead className="hidden md:table-cell">Unit</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map((material) => (
                    <TableRow key={material.id}>
                      <TableCell>
                        <Link
                          href={material.href}
                          className="font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {material.name}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">
                        {material.code}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatStock(material.currentStock, material.unit)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {material.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatReorderLevel(material.reorderLevel, material.unit)}
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge status={material.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
