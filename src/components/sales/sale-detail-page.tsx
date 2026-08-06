'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Info, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { completeSaleAction, deleteSaleAction, getSaleAction } from '@/actions/sales';
import { SaleDetailSummary } from '@/components/sales/sale-detail-summary';
import { SaleStatusBadge } from '@/components/sales/sale-status-badge';
import { useAuth } from '@/hooks/use-auth';
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
import { formatMoney } from '@/lib/utils/money';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries } from '@/lib/utils/query-invalidation';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

type SaleDetailPageProps = {
  saleId: string;
};

const DETAIL_TABLE_HEAD_CLASS = 'normal-case text-sm font-medium tracking-normal';
const DETAIL_TABLE_CELL_CLASS = 'py-4 text-base';

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
  const { isAuthenticated } = useAuth();
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
    enabled: isAuthenticated,
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
  const customerLabel = sale.customerNameSnapshot?.trim() || 'Walk-in';
  const headerSubtitle = `${formatDate(sale.saleDate)} · ${customerLabel} · ${formatMoney(sale.subtotal)}`;

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
          <div className="flex flex-wrap items-center gap-3">
            <TruncatedText
              text={sale.saleNumber}
              maxWidthClassName="max-w-[min(100%,480px)]"
              className="text-left font-heading text-2xl font-semibold tracking-tight"
            />
            <SaleStatusBadge status={sale.status} />
          </div>
        }
        description={headerSubtitle}
      >
        {canEdit ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="success"
              size="xl"
              onClick={() => setIsCompleteOpen(true)}
              disabled={isBusy}
            >
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
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setIsDeleteOpen(true)}
              disabled={isBusy}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        ) : null}
      </PageHeader>

      {canEdit ? (
        <DraftActionBanner
          title="Stock not updated yet"
          description="Review the lines below, then press Complete Sale at the top to deduct product stock."
          icon={Info}
          alertVariant="default"
          showAction={false}
        />
      ) : null}

      <SaleDetailSummary
        saleDateLabel={formatDate(sale.saleDate)}
        customerLabel={customerLabel}
        subtotal={sale.subtotal}
        productLineCount={sale.lineCount}
        isDraft={canEdit}
      />

      <Card>
        <CardHeader>
          <CardTitle>Sale details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailField label="Sale date" value={formatDate(sale.saleDate)} />
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
                'Walk-in'
              )
            }
          />
          <DetailField label="Product lines" value={sale.lineCount} />
          <DetailField
            label="Subtotal"
            value={
              <span className="text-base font-semibold tabular-nums">
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
          <DetailField label="Created" value={formatDateTime(sale.createdAt)} />
          <DetailField label="Updated" value={formatDateTime(sale.updatedAt)} />
          {sale.completedAt ? (
            <DetailField label="Completed" value={formatDateTime(sale.completedAt)} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product lines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="text-base">
              <TableHeader>
                <TableRow>
                  <TableHead className={`w-12 ${DETAIL_TABLE_HEAD_CLASS}`}>#</TableHead>
                  <TableHead className={`min-w-[180px] ${DETAIL_TABLE_HEAD_CLASS}`}>
                    Product
                  </TableHead>
                  <TableHead className={`text-right whitespace-nowrap ${DETAIL_TABLE_HEAD_CLASS}`}>
                    Quantity
                  </TableHead>
                  <TableHead className={`whitespace-nowrap ${DETAIL_TABLE_HEAD_CLASS}`}>
                    Unit
                  </TableHead>
                  <TableHead className={`text-right whitespace-nowrap ${DETAIL_TABLE_HEAD_CLASS}`}>
                    Price
                  </TableHead>
                  <TableHead className={`text-right whitespace-nowrap ${DETAIL_TABLE_HEAD_CLASS}`}>
                    Line total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.lines.map((line, index) => (
                  <TableRow key={line.id}>
                    <TableCell className={DETAIL_TABLE_CELL_CLASS}>{index + 1}</TableCell>
                    <TableCell className={DETAIL_TABLE_CELL_CLASS}>
                      {line.productCodeSnapshot} - {line.productNameSnapshot}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${DETAIL_TABLE_CELL_CLASS}`}>
                      {formatQuantity(line.quantity)}
                    </TableCell>
                    <TableCell className={DETAIL_TABLE_CELL_CLASS}>{line.unit}</TableCell>
                    <TableCell className={`text-right tabular-nums ${DETAIL_TABLE_CELL_CLASS}`}>
                      <MoneyDisplay amount={line.sellingPriceSnapshot} />
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${DETAIL_TABLE_CELL_CLASS}`}>
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
        description={`Complete "${sale.saleNumber}"? Product stock will be deducted for all ${sale.lineCount} line${sale.lineCount === 1 ? '' : 's'}. This cannot be undone.`}
        confirmLabel="Complete Sale"
        confirmVariant="success"
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
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm">{value}</div>
    </div>
  );
}
