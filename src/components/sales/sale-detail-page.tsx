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
import { DraftActionBanner } from '@/components/shared/draft-action-banner';
import { MoneyDisplay } from '@/components/shared/money-display';
import { PageHeader } from '@/components/shared/page-header';
import { TruncatedText } from '@/components/shared/truncated-text';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
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
import { toastFormError } from '@/lib/utils/toast-form-error';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

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

  const { data: sale, isLoading, error, refetch, isRefetching } = useQuery({
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
        toastFormError(result.error);
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
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete('Sale completed. Product stock has been updated.', {
        recordAnother: {
          label: 'Record another',
          onClick: () => router.push('/sales/new'),
        },
      });
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
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load sale"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Sale not found</AlertTitle>
            <AlertDescription>The requested sale could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
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

      {canEdit ? (
        <DraftActionBanner
          title="Draft sale — stock not updated yet"
          description="Review the lines below, then complete this sale to deduct product stock."
          actionLabel="Complete Sale"
          onAction={() => setIsCompleteOpen(true)}
          icon={CheckCircle2}
          disabled={isBusy}
        />
      ) : null}

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
        description={`Complete "${sale.saleNumber}"? Product stock will be deducted for all ${sale.lineCount} line${sale.lineCount === 1 ? '' : 's'}. This cannot be undone.`}
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
