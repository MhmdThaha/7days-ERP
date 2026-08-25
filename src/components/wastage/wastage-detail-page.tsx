'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { completeWastageAction, deleteWastageAction, getWastageAction } from '@/actions/wastage';
import { useClearWorkflowResumeOnFailure } from '@/hooks/use-clear-workflow-resume-on-failure';
import { useAuth } from '@/hooks/use-auth';
import { WastageStatusBadge } from '@/components/wastage/wastage-status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DraftActionBanner } from '@/components/shared/draft-action-banner';
import { LoadErrorAlert } from '@/components/shared/load-error-alert';
import { PageHeader } from '@/components/shared/page-header';
import { TruncatedText } from '@/components/shared/truncated-text';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductsByIds } from '@/hooks/use-products-by-ids';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { WASTAGE_REASON_LABELS } from '@/lib/domain/constants/wastage';
import {
  formatWastageStock,
  getWastageLineStockErrors,
  hasWastageLinesStockErrors,
} from '@/lib/utils/wastage-stock-validation';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries, invalidateProductStockQueries } from '@/lib/utils/query-invalidation';
import { clearModuleWorkflowOnExit } from '@/lib/navigation/module-workflow-resume';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

type WastageDetailPageProps = {
  wastageId: string;
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

export function WastageDetailPage({ wastageId }: WastageDetailPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const { data: wastage, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['wastage-entry', wastageId],
    queryFn: async () => {
      const result = await getWastageAction(wastageId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  useClearWorkflowResumeOnFailure('wastage', Boolean(error || !wastage));

  const isDraft = wastage?.status === 'draft';

  const wastageProductIds = useMemo(
    () => wastage?.lines.map((line) => line.productId).filter(Boolean) ?? [],
    [wastage?.lines],
  );

  const { productsById, isLoading: isLoadingProducts } = useProductsByIds(
    isDraft ? wastageProductIds : [],
  );

  const lineStockErrors = useMemo(() => {
    if (!wastage) {
      return [];
    }

    return getWastageLineStockErrors(
      wastage.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
      })),
      productsById,
    );
  }, [wastage, productsById]);

  const hasInsufficientStock = useMemo(() => {
    if (!wastage) {
      return false;
    }

    return hasWastageLinesStockErrors(
      wastage.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
      })),
      productsById,
    );
  }, [wastage, productsById]);

  async function invalidateWastageQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wastage'] }),
      queryClient.invalidateQueries({ queryKey: ['wastage-entry', wastageId] }),
      invalidateProductStockQueries(queryClient),
      invalidateDashboardQueries(queryClient),
      invalidateDailyReportQueries(queryClient),
      invalidateMonthlyReportQueries(queryClient),
    ]);
  }

  async function handleComplete() {
    if (isCompleting || hasInsufficientStock || isLoadingProducts) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeWastageAction(wastageId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete('Wastage completed. Product stock has been deducted.', {
        recordAnother: {
          label: 'Record another',
          onClick: () => router.push('/wastage/new'),
        },
      });
      setIsCompleteOpen(false);

      await invalidateWastageQueries();

      clearModuleWorkflowOnExit('wastage');
      router.push('/wastage');
    } finally {
      setIsCompleting(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteWastageAction(wastageId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Wastage draft deleted successfully');
      setIsDeleteOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wastage'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      clearModuleWorkflowOnExit('wastage');
      router.push('/wastage');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading wastage entry">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !wastage) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load wastage entry"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Wastage entry not found</AlertTitle>
            <AlertDescription>The requested wastage entry could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  const canEdit = wastage.status === 'draft';
  const isBusy = isDeleting || isCompleting;
  const canComplete = canEdit && !hasInsufficientStock && !isLoadingProducts;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/wastage" />}>
          <ArrowLeft />
          Back to Waste & Spoilage
        </Button>
      </div>

      <PageHeader
        title={
          <TruncatedText
            text={wastage.wastageNumber}
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
              render={<Link href={`/wastage/${wastageId}/edit`} />}
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
          title="Draft wastage — stock not updated yet"
          description="Complete this entry to deduct spoiled or wasted products from inventory."
          actionLabel="Complete Wastage"
          onAction={() => setIsCompleteOpen(true)}
          icon={CheckCircle2}
          disabled={isBusy || !canComplete}
        />
      ) : null}

      {canEdit && hasInsufficientStock && !isLoadingProducts ? (
        <Alert variant="destructive">
          <AlertTitle>Insufficient stock</AlertTitle>
          <AlertDescription>
            One or more product lines exceed available stock. Edit the wastage entry to adjust
            quantities before completing.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Wastage Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailField label="Wastage Date" value={formatDate(wastage.wastageDate)} />
          <DetailField label="Status" value={<WastageStatusBadge status={wastage.status} />} />
          <DetailField label="Reason" value={WASTAGE_REASON_LABELS[wastage.reason]} />
          <DetailField label="Product Lines" value={wastage.lineCount} />
          <DetailField label="Total Units" value={formatQuantity(wastage.totalUnits)} />
          <DetailField
            label="Notes"
            value={
              <span className="break-words whitespace-pre-wrap">{wastage.notes ?? '—'}</span>
            }
            className="sm:col-span-2"
          />
          <DetailField label="Created At" value={formatDateTime(wastage.createdAt)} />
          <DetailField label="Updated At" value={formatDateTime(wastage.updatedAt)} />
          {wastage.completedAt ? (
            <DetailField label="Completed At" value={formatDateTime(wastage.completedAt)} />
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
                  {canEdit ? (
                    <TableHead className="text-right whitespace-nowrap">Available</TableHead>
                  ) : null}
                  <TableHead className="whitespace-nowrap">Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wastage.lines.map((line, index) => {
                  const product = productsById.get(line.productId);
                  const stockError = lineStockErrors[index];

                  return (
                    <TableRow key={line.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        {line.productCodeSnapshot} - {line.productNameSnapshot}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(line.quantity)}
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          {product ? (
                            <span className={stockError ? 'text-destructive tabular-nums' : 'tabular-nums'}>
                              {formatWastageStock(product.currentStock, line.unit)}
                            </span>
                          ) : (
                            '—'
                          )}
                          {stockError ? (
                            <p className="mt-1 text-xs text-destructive">{stockError}</p>
                          ) : null}
                        </TableCell>
                      ) : null}
                      <TableCell>{line.unit}</TableCell>
                    </TableRow>
                  );
                })}
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
        title="Delete wastage draft?"
        description={`This will soft-delete "${wastage.wastageNumber}". It will no longer appear in active lists but historical data is preserved.`}
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
        title="Complete Wastage"
        description={`Complete "${wastage.wastageNumber}"? ${formatQuantity(wastage.totalUnits)} units will be deducted from product stock. This cannot be undone.`}
        confirmLabel="Complete Wastage"
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
