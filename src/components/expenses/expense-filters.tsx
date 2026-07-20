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
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
} from '@/lib/domain/constants/expense';
import type { ExpenseCategory, ExpenseStatusFilter } from '@/types/expense';

type ExpenseFiltersProps = {
  search: string;
  category: ExpenseCategory | 'all';
  status: ExpenseStatusFilter;
  isSearching?: boolean;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: ExpenseCategory | 'all') => void;
  onStatusChange: (value: ExpenseStatusFilter) => void;
};

export function ExpenseFilters({
  search,
  category,
  status,
  isSearching = false,
  disabled = false,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
}: ExpenseFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Label htmlFor="expense-search" className="sr-only">
          Search expenses
        </Label>
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="expense-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by expense number or category..."
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

      <div className="sm:w-44">
        <Label htmlFor="expense-category" className="sr-only">
          Filter by category
        </Label>
        <Select
          value={category}
          onValueChange={(value) => onCategoryChange((value ?? 'all') as ExpenseCategory | 'all')}
          disabled={disabled}
        >
          <SelectTrigger id="expense-category" className="w-full">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {EXPENSE_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {EXPENSE_CATEGORY_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="sm:w-36">
        <Label htmlFor="expense-status" className="sr-only">
          Filter by status
        </Label>
        <Select
          value={status}
          onValueChange={(value) => onStatusChange((value ?? 'all') as ExpenseStatusFilter)}
          disabled={disabled}
        >
          <SelectTrigger id="expense-status" className="w-full">
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
