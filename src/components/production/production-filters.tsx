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
import type { ProductionStatusFilter } from '@/types/production';

type ProductionFiltersProps = {
  search: string;
  status: ProductionStatusFilter;
  isSearching?: boolean;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: ProductionStatusFilter) => void;
};

export function ProductionFilters({
  search,
  status,
  isSearching = false,
  disabled = false,
  onSearchChange,
  onStatusChange,
}: ProductionFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Label htmlFor="production-search" className="sr-only">
          Search production entries
        </Label>
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="production-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by production number..."
          className="pl-8 pr-8"
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
        <Label htmlFor="production-status" className="sr-only">
          Filter by status
        </Label>
        <Select
          value={status}
          onValueChange={(value) => onStatusChange((value ?? 'all') as ProductionStatusFilter)}
          disabled={disabled}
        >
          <SelectTrigger id="production-status" className="w-full">
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
