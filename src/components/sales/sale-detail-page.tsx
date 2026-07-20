'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { completeSaleAction, deleteSaleAction, getSaleAction } from '@/actions/sales';
import { SaleStatusBadge } from '@/components/sales/sale-status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { MoneyDisplay } from '@/components/shared/money-display';
import { PageHeader } from '@/components/shared/page-header';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';

type SaleDetailPageProps = {
  saleId: string;
};

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

function formatQuantity(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function SaleDetailPage({ saleId }: SaleDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const { data: sale, isLoading, error } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      const result = await getSaleAction(saleId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
  });

  async function invalidateSaleQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      invalidateDashboardQueries(queryClient),
      invalidateDailyReportQueries(queryClient),
      invalidateMonthlyReportQueries(queryClient),
    ]);
  }

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteSaleAction(saleId);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Sale draft deleted successfully');
      setIsDeleteOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push('/sales');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleComplete() {
    if (isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeSaleAction(saleId);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Sale completed successfully. Product stock has been updated.');
      setIsCompleteOpen(false);

      await invalidateSaleQueries();
    } finally {
      setIsCompleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading sale">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Sale not found</AlertTitle>
        <AlertDescription>
          {error?.message ?? 'The requested sale could not be loaded.'}
        </AlertDescription>
      </Alert>
    );
  }

  const canEdit = sale.status === 'draft';
  const isBusy = isDeleting || isCompleting;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/sales" />}>
          <ArrowLeft />
          Back to Sales
        </Button>
      </div>

      <PageHeader
        title={
          <TruncatedText
            text={sale.saleNumber}
            maxWidthClassName="max-w-[min(100%,480px)]"
            className="text-left font-heading text-2xl font-semibold tracking-tight"
          />
        }
      >
        {canEdit ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button onClick={() => setIsCompleteOpen(true)} disabled={isBusy}>
              <CheckCircle2 />
              Complete Sale
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link href={`/sales/${saleId}/edit`} />}
              disabled={isBusy}
            >
              <Pencil />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setIsDeleteOpen(true)} disabled={isBusy}>
              <Trash2 />
              Delete
            </Button>
          </div>
        ) : null}
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Sale Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailField label="Sale Date" value={formatDate(sale.saleDate)} />
          <DetailField label="Status" value={<SaleStatusBadge status={sale.status} />} />
          <DetailField
            label="Customer"
            value={
              sale.customerNameSnapshot ? (
                <TruncatedText
                  text={sale.customerNameSnapshot}
                  maxWidthClassName="max-w-full"
                />
              ) : (
                '—'
              )
            }
          />
          <DetailField label="Product Lines" value={sale.lineCount} />
          <DetailField
            label="Subtotal"
            value={
              <span className="font-medium tabular-nums">
                <MoneyDisplay amount={sale.subtotal} />
              </span>
            }
          />
          <DetailField
            label="Notes"
            value={
              <span className="break-words whitespace-pre-wrap">{sale.notes ?? '—'}</span>
            }
            className="sm:col-span-2"
          />
          <DetailField label="Created At" value={formatDateTime(sale.createdAt)} />
          <DetailField label="Updated At" value={formatDateTime(sale.updatedAt)} />
          {sale.completedAt ? (
            <DetailField label="Completed At" value={formatDateTime(sale.completedAt)} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="min-w-[180px]">Product</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Quantity</TableHead>
                  <TableHead className="whitespace-nowrap">Unit</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Selling Price</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Line Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.lines.map((line, index) => (
                  <TableRow key={line.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      {line.productCodeSnapshot} - {line.productNameSnapshot}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.quantity)}
                    </TableCell>
                    <TableCell>{line.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay amount={line.sellingPriceSnapshot} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay amount={line.lineTotal} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          setIsDeleteOpen(open);
        }}
        title="Delete sale draft?"
        description={`This will soft-delete "${sale.saleNumber}". It will no longer appear in active lists but historical data is preserved.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        loadingLabel="Deleting..."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={isCompleteOpen}
        onOpenChange={(open) => {
          if (isCompleting) {
            return;
          }

          setIsCompleteOpen(open);
        }}
        title="Complete Sale"
        description="Are you sure you want to complete this sale?"
        confirmLabel="Complete Sale"
        loadingLabel="Completing..."
        isLoading={isCompleting}
        onConfirm={handleComplete}
      />
    </div>
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-1.5 text-sm">{value}</div>
    </div>
  );
}
