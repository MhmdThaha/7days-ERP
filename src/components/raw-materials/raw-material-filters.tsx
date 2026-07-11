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
import { Switch } from '@/components/ui/switch';
import { DEFAULT_RAW_MATERIAL_CATEGORIES } from '@/lib/domain/constants/raw-material';
import type { RawMaterialStatusFilter } from '@/types/raw-material';

type RawMaterialFiltersProps = {
  search: string;
  status: RawMaterialStatusFilter;
  category: string;
  lowStockOnly: boolean;
  isSearching?: boolean;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: RawMaterialStatusFilter) => void;
  onCategoryChange: (value: string) => void;
  onLowStockOnlyChange: (value: boolean) => void;
};

export function RawMaterialFilters({
  search,
  status,
  category,
  lowStockOnly,
  isSearching = false,
  disabled = false,
  onSearchChange,
  onStatusChange,
  onCategoryChange,
  onLowStockOnlyChange,
}: RawMaterialFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor="raw-material-search" className="sr-only">
            Search raw materials
          </Label>
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="raw-material-search"
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

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="w-full sm:w-40">
            <Label htmlFor="raw-material-status" className="sr-only">
              Filter by status
            </Label>
            <Select
              value={status}
              onValueChange={(value) =>
                onStatusChange((value ?? 'active') as RawMaterialStatusFilter)
              }
              disabled={disabled}
            >
              <SelectTrigger id="raw-material-status" className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-44">
            <Label htmlFor="raw-material-category" className="sr-only">
              Filter by category
            </Label>
            <Select
              value={category}
              onValueChange={(value) => onCategoryChange(value ?? 'all')}
              disabled={disabled}
            >
              <SelectTrigger id="raw-material-category" className="w-full">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {DEFAULT_RAW_MATERIAL_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 sm:w-auto">
            <Switch
              id="raw-material-low-stock"
              checked={lowStockOnly}
              onCheckedChange={onLowStockOnlyChange}
              disabled={disabled}
              aria-label="Show low stock only"
            />
            <Label
              htmlFor="raw-material-low-stock"
              className="cursor-pointer text-sm font-normal leading-snug"
            >
              Low stock only
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
