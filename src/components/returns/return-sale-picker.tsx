'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { listSalesAction } from '@/actions/sales';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/utils/money';
import type { SaleListItem } from '@/types/sale';

type ReturnSalePickerProps = {
  onSelect: (saleId: string) => void;
};

function formatSaleDate(date: string): string {
  const [year, month, day] = date.split('-');

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

export function ReturnSalePicker({ onSelect }: ReturnSalePickerProps) {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['return-sale-picker', search],
    queryFn: async () => {
      const result = await listSalesAction({
        search,
        status: 'completed',
        page: 1,
        pageSize: 25,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  const sales = useMemo(() => data?.items ?? [], [data?.items]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="return-sale-search">Find completed sale</Label>
        <Input
          id="return-sale-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by sale number or customer"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading sales...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Unable to load sales.</p>
      ) : sales.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No completed sales found. Complete a sale first, then record the return from that sale.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sales.map((sale: SaleListItem) => (
            <li key={sale.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{sale.saleNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {formatSaleDate(sale.saleDate)} ? {formatMoney(sale.subtotal)} ? {sale.lineCount} lines
                  {sale.customerNameSnapshot ? ` ? ${sale.customerNameSnapshot}` : ''}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => onSelect(sale.id)}>
                Select
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button nativeButton={false} variant="ghost" render={<Link href="/sales" />}>
        Browse all sales
      </Button>
    </div>
  );
}
