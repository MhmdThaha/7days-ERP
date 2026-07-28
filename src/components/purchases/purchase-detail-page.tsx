'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deletePurchaseAction, getPurchaseAction, receivePurchaseAction } from '@/actions/purchases';
import { useAuth } from '@/hooks/use-auth';
import { PaymentStatusBadge } from '@/components/purchases/payment-status-badge';
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
import { invalidateDashboardQueries } from '@/lib/utils/query-invalidation';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

type PurchaseDetailPageProps = {
  purchaseId: string;
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
            <TruncatedText
              text={purchase.purchaseNumber}
              maxWidthClassName="max-w-[min(100%,480px)]"
              className="text-left font-heading text-2xl font-semibold tracking-tight"
            />
          }
        >
          {canModify ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button onClick={() => setIsReceiveOpen(true)} disabled={isBusy}>
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
              <Button variant="destructive" onClick={() => setIsDeleteOpen(true)} disabled={isBusy}>
                <Trash2 />
                Delete
              </Button>
            </div>
          ) : null}
        </PageHeader>

        {canModify ? (
          <DraftActionBanner
            title="Draft purchase — stock not updated yet"
            description="When goods arrive, receive this purchase to add raw materials to inventory."
            actionLabel="Receive Purchase"
            onAction={() => setIsReceiveOpen(true)}
            icon={PackageCheck}
            disabled={isBusy}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Purchase Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailField label="Purchase Date" value={formatDate(purchase.purchaseDate)} />
            <DetailField label="Supplier Name" value={purchase.supplierName} />
            <DetailField label="Invoice Number" value={purchase.invoiceNumber ?? '—'} />
            <DetailField
              label="Payment Status"
              value={<PaymentStatusBadge paymentStatus={purchase.paymentStatus} />}
            />
            <DetailField label="Status" value={<PurchaseStatusBadge status={purchase.status} />} />
            <DetailField
              label="Grand Total"
              value={<MoneyDisplay amount={purchase.totalAmount} className="font-semibold" />}
            />
            <DetailField
              label="Notes"
              value={
                <span className="break-words whitespace-pre-wrap">{purchase.notes ?? '—'}</span>
              }
              className="sm:col-span-2"
            />
            {purchase.receivedAt ? (
              <DetailField label="Received At" value={formatDateTime(purchase.receivedAt)} />
            ) : null}
            <DetailField label="Created At" value={formatDateTime(purchase.createdAt)} />
            <DetailField label="Updated At" value={formatDateTime(purchase.updatedAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent>
                          <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="min-w-[180px]">Raw Material</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Quantity</TableHead>
                    <TableHead className="whitespace-nowrap">Unit</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Unit Cost</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchase.lineItems.map((lineItem, index) => (
                    <TableRow key={lineItem.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        {lineItem.rawMaterialCode} - {lineItem.rawMaterialName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(lineItem.quantity)}
                      </TableCell>
                      <TableCell>{lineItem.unit}</TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay amount={lineItem.unitCost} />
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay amount={lineItem.lineTotal} />
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
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-1.5 text-sm">{value}</div>
    </div>
  );
}
