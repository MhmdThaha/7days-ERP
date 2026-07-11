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
import type { ProductStatusFilter } from '@/types/product';

type ProductFiltersProps = {
  search: string;
  status: ProductStatusFilter;
  isSearching?: boolean;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: ProductStatusFilter) => void;
};

export function ProductFilters({
  search,
  status,
  isSearching = false,
  disabled = false,
  onSearchChange,
  onStatusChange,
}: ProductFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Label htmlFor="product-search" className="sr-only">
          Search products
        </Label>
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="product-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or code..."
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

      <div className="sm:w-40">
        <Label htmlFor="product-status" className="sr-only">
          Filter by status
        </Label>
        <Select
          value={status}
          onValueChange={(value) => onStatusChange((value ?? 'active') as ProductStatusFilter)}
          disabled={disabled}
        >
          <SelectTrigger id="product-status" className="w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
