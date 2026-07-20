'use client';

import { Loader2, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SaleStatusFilter } from '@/types/sale';

type SaleFiltersProps = {
  search: string;
  status: SaleStatusFilter;
  isSearching?: boolean;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: SaleStatusFilter) => void;
};

export function SaleFilters({
  search,
  status,
  isSearching = false,
  disabled = false,
  onSearchChange,
  onStatusChange,
}: SaleFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Label htmlFor="sale-search" className="sr-only">
          Search sales
        </Label>
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="sale-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by sale number or customer..."
          className="pr-8 pl-8"
          disabled={disabled}
          aria-busy={isSearching}
        />
        {isSearching ? (
          <Loader2
            className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="sm:w-36">
        <Label htmlFor="sale-status" className="sr-only">
          Filter by status
        </Label>
        <Select
          value={status}
          onValueChange={(value) => onStatusChange((value ?? 'all') as SaleStatusFilter)}
          disabled={disabled}
        >
          <SelectTrigger id="sale-status" className="w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
