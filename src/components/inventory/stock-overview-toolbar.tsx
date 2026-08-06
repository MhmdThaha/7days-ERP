'use client';

import { Search } from 'lucide-react';

import type { StockOverviewStatusFilter } from '@/components/inventory/stock-overview-table-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type StockOverviewToolbarProps = {
  search: string;
  statusFilter: StockOverviewStatusFilter;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StockOverviewStatusFilter) => void;
};

const STATUS_FILTERS: { value: StockOverviewStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'low_stock', label: 'Low' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

export function StockOverviewToolbar({
  search,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
}: StockOverviewToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Label htmlFor="stock-overview-search" className="sr-only">
          Search inventory
        </Label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="stock-overview-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search products and raw materials..."
          className="pl-9"
          aria-label="Search inventory"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by stock status">
        {STATUS_FILTERS.map((filter) => {
          const isActive = statusFilter === filter.value;

          return (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={isActive ? 'secondary' : 'outline'}
              className={cn(isActive && 'ring-1 ring-border')}
              aria-pressed={isActive}
              onClick={() => onStatusFilterChange(filter.value)}
            >
              {filter.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
