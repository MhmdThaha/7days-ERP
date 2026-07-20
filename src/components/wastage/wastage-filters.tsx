'use client';

import { Loader2, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type WastageFiltersProps = {
  search: string;
  isSearching?: boolean;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
};

export function WastageFilters({
  search,
  isSearching = false,
  disabled = false,
  onSearchChange,
}: WastageFiltersProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <Label htmlFor="wastage-search" className="sr-only">
        Search wastage entries
      </Label>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id="wastage-search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search by wastage number or reason..."
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
  );
}
