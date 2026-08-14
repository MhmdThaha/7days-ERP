'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, PackageCheck, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deletePurchaseAction, getPurchaseAction, receivePurchaseAction } from '@/actions/purchases';
import { useAuth } from '@/hooks/use-auth';
import { PaymentStatusBadge } from '@/components/purchases/payment-status-badge';
import { PurchaseDetailSummary } from '@/components/purchases/purchase-detail-summary';
import { PurchaseStatusBadge } from '@/components/purchases/purchase-status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DraftActionBanner } from '@/components/shared/draft-action-banner';
import { MoneyDisplay } from '@/components/shared/money-display';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { formatMoney } from '@/lib/utils/money';
import { invalidateDailyReportQueries, invalidateDashboardQueries } from '@/lib/utils/query-invalidation';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

type PurchaseDetailPageProps = {
  purchaseId: string;
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

export function PurchaseDetailPage({ purchaseId }: PurchaseDetailPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);

  const { data: purchase, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: async () => {
      const result = await getPurchaseAction(purchaseId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  async function invalidatePurchaseQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      queryClient.invalidateQueries({ queryKey: ['purchase', purchaseId] }),
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] }),
      invalidateDashboardQueries(queryClient),
      invalidateDailyReportQueries(queryClient),
    ]);
  }

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deletePurchaseAction(purchaseId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Purchase deleted successfully');
      setIsDeleteOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        invalidateDashboardQueries(queryClient),
      ]);

      router.push('/purchases');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReceive() {
    if (isReceiving) {
      return;
    }

    setIsReceiving(true);

    try {
      const result = await receivePurchaseAction(purchaseId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete('Purchase received. Raw material stock has been updated.', {
        nextStep: {
          label: 'Record Production',
          onClick: () => router.push('/production/new'),
        },
      });
      setIsReceiveOpen(false);

      await invalidatePurchaseQueries();
    } finally {
      setIsReceiving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading purchase">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load purchase"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Purchase not found</AlertTitle>
            <AlertDescription>The requested purchase could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  const canModify = purchase.status === 'draft';
  const isBusy = isDeleting || isReceiving;
  const headerSubtitle = `${formatDate(purchase.purchaseDate)} · ${purchase.supplierName} · ${formatMoney(purchase.totalAmount)}`;

  return (
    <TooltipProvider delay={300}>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/purchases" />}>
            <ArrowLeft />
            Back to Purchases
          </Button>
        </div>

        <PageHeader
          title={
            <div className="flex flex-wrap items-center gap-3">
              <TruncatedText
                text={purchase.purchaseNumber}
                maxWidthClassName="max-w-[min(100%,480px)]"
                className="text-left font-heading text-2xl font-semibold tracking-tight"
              />
              <PurchaseStatusBadge status={purchase.status} />
            </div>
          }
          description={headerSubtitle}
        >
          {canModify ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                variant="success"
                size="xl"
                onClick={() => setIsReceiveOpen(true)}
                disabled={isBusy}
              >
                <PackageCheck />
                Receive Purchase
              </Button>
              <Button
                nativeButton={false}
                variant="outline"
                render={<Link href={`/purchases/${purchaseId}/edit`} />}
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

        {canModify ? (
          <DraftActionBanner
            title="Stock not received yet"
            description="Review the line items below, then press Receive Purchase at the top to add materials to inventory."
            icon={Info}
            alertVariant="default"
            showAction={false}
          />
        ) : null}

        <PurchaseDetailSummary
          purchaseDateLabel={formatDate(purchase.purchaseDate)}
          supplierLabel={purchase.supplierName}
          grandTotal={purchase.totalAmount}
          lineItemCount={purchase.lineItemCount}
          paymentStatus={purchase.paymentStatus}
          isDraft={canModify}
        />

        <Card>
          <CardHeader>
            <CardTitle>Purchase details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailField label="Purchase date" value={formatDate(purchase.purchaseDate)} />
            <DetailField label="Supplier" value={purchase.supplierName} />
            <DetailField label="Invoice number" value={purchase.invoiceNumber ?? '—'} />
            <DetailField
              label="Payment"
              value={<PaymentStatusBadge paymentStatus={purchase.paymentStatus} />}
            />
            <DetailField label="Status" value={<PurchaseStatusBadge status={purchase.status} />} />
            <DetailField
              label="Grand total"
              value={
                <span className="text-base font-semibold tabular-nums">
                  <MoneyDisplay amount={purchase.totalAmount} />
                </span>
              }
            />
            <DetailField
              label="Notes"
              value={
                <span className="break-words whitespace-pre-wrap">{purchase.notes ?? '—'}</span>
              }
              className="sm:col-span-2"
            />
            {purchase.receivedAt ? (
              <DetailField label="Received" value={formatDateTime(purchase.receivedAt)} />
            ) : null}
            <DetailField label="Created" value={formatDateTime(purchase.createdAt)} />
            <DetailField label="Updated" value={formatDateTime(purchase.updatedAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table className="text-base">
                <TableHeader>
                  <TableRow>
                    <TableHead className={`w-12 ${DETAIL_TABLE_HEAD_CLASS}`}>#</TableHead>
                    <TableHead className={`min-w-[180px] ${DETAIL_TABLE_HEAD_CLASS}`}>
                      Raw material
                    </TableHead>
                    <TableHead className={`text-right whitespace-nowrap ${DETAIL_TABLE_HEAD_CLASS}`}>
                      Quantity
                    </TableHead>
                    <TableHead className={`whitespace-nowrap ${DETAIL_TABLE_HEAD_CLASS}`}>
                      Unit
                    </TableHead>
                    <TableHead className={`text-right whitespace-nowrap ${DETAIL_TABLE_HEAD_CLASS}`}>
                      Unit cost
                    </TableHead>
                    <TableHead className={`text-right whitespace-nowrap ${DETAIL_TABLE_HEAD_CLASS}`}>
                      Line total
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchase.lineItems.map((lineItem, index) => (
                    <TableRow key={lineItem.id}>
                      <TableCell className={DETAIL_TABLE_CELL_CLASS}>{index + 1}</TableCell>
                      <TableCell className={DETAIL_TABLE_CELL_CLASS}>
                        {lineItem.rawMaterialCode} - {lineItem.rawMaterialName}
                        {lineItem.packCount !== null &&
                        lineItem.packSize !== null &&
                        lineItem.packPrice !== null ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {lineItem.packCount.toLocaleString('en-IN', {
                              maximumFractionDigits: 3,
                            })}{' '}
                            × {formatQuantity(lineItem.packSize)} {lineItem.unit} @{' '}
                            <MoneyDisplay amount={lineItem.packPrice} />
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${DETAIL_TABLE_CELL_CLASS}`}>
                        {formatQuantity(lineItem.quantity)}
                      </TableCell>
                      <TableCell className={DETAIL_TABLE_CELL_CLASS}>{lineItem.unit}</TableCell>
                      <TableCell className={`text-right ${DETAIL_TABLE_CELL_CLASS}`}>
                        <MoneyDisplay amount={lineItem.unitCost} />
                      </TableCell>
                      <TableCell className={`text-right ${DETAIL_TABLE_CELL_CLASS}`}>
                        <MoneyDisplay amount={lineItem.lineTotal} />
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
          title="Delete purchase?"
          description={`This will soft-delete "${purchase.purchaseNumber}". It will no longer appear in active lists but historical data is preserved.`}
          confirmLabel="Delete"
          confirmVariant="destructive"
          loadingLabel="Deleting..."
          isLoading={isDeleting}
          onConfirm={handleDelete}
        />

        <ConfirmDialog
          open={isReceiveOpen}
          onOpenChange={(open) => {
            if (isReceiving) {
              return;
            }

            setIsReceiveOpen(open);
          }}
          title="Receive Purchase"
          description={`Receive "${purchase.purchaseNumber}"? Raw material stock will increase for ${purchase.lineItemCount} line${purchase.lineItemCount === 1 ? '' : 's'}. This cannot be undone.`}
          confirmLabel="Receive Purchase"
          confirmVariant="success"
          loadingLabel="Receiving..."
          isLoading={isReceiving}
          onConfirm={handleReceive}
        />
      </div>
    </TooltipProvider>
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
