'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { completeReturnAction, deleteReturnAction, getReturnAction } from '@/actions/returns';
import { useAuth } from '@/hooks/use-auth';
import { ReturnStatusBadge } from '@/components/returns/return-status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DraftActionBanner } from '@/components/shared/draft-action-banner';
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
import { RETURN_REASON_LABELS } from '@/lib/domain/constants/return';
import { toastFormError } from '@/lib/utils/toast-form-error';
import { invalidateDailyReportQueries, invalidateDashboardQueries, invalidateMonthlyReportQueries, invalidateProductStockQueries } from '@/lib/utils/query-invalidation';
import { toastWorkflowComplete } from '@/lib/utils/workflow-toasts';

type ReturnDetailPageProps = {
  returnId: string;
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

export function ReturnDetailPage({ returnId }: ReturnDetailPageProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const { data: returnEntry, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['return-entry', returnId],
    queryFn: async () => {
      const result = await getReturnAction(returnId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    },
    enabled: isAuthenticated,
  });

  async function invalidateReturnQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['returns'] }),
      queryClient.invalidateQueries({ queryKey: ['return-entry', returnId] }),
      invalidateProductStockQueries(queryClient),
      invalidateDashboardQueries(queryClient),
      invalidateDailyReportQueries(queryClient),
      invalidateMonthlyReportQueries(queryClient),
    ]);
  }

  async function handleComplete() {
    if (isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      const result = await completeReturnAction(returnId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toastWorkflowComplete('Return completed. Product stock has been restored.', {
        recordAnother: {
          label: 'Record another',
          onClick: () => router.push('/returns/new'),
        },
      });
      setIsCompleteOpen(false);

      await invalidateReturnQueries();
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
      const result = await deleteReturnAction(returnId);

      if (!result.success) {
        toastFormError(result.error);
        return;
      }

      toast.success('Return draft deleted successfully');
      setIsDeleteOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        invalidateDashboardQueries(queryClient),
        invalidateDailyReportQueries(queryClient),
        invalidateMonthlyReportQueries(queryClient),
      ]);

      router.push('/returns');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading return">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !returnEntry) {
    return (
      <div className="space-y-4">
        <LoadErrorAlert
          title="Unable to load return"
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
        {!error ? (
          <Alert variant="destructive">
            <AlertTitle>Return not found</AlertTitle>
            <AlertDescription>The requested return could not be loaded.</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  const canEdit = returnEntry.status === 'draft';
  const isBusy = isDeleting || isCompleting;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/returns" />}>
          <ArrowLeft />
          Back to Customer Returns
        </Button>
      </div>

      <PageHeader
        title={
          <TruncatedText
            text={returnEntry.returnNumber}
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
              render={<Link href={`/returns/${returnId}/edit`} />}
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
          title="Draft return — stock not updated yet"
          description="Complete this return to restore product stock for returned items."
          actionLabel="Complete Return"
          onAction={() => setIsCompleteOpen(true)}
          icon={CheckCircle2}
          disabled={isBusy}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Return Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailField label="Return Date" value={formatDate(returnEntry.returnDate)} />
          <DetailField label="Status" value={<ReturnStatusBadge status={returnEntry.status} />} />
          <DetailField label="Return Reason" value={RETURN_REASON_LABELS[returnEntry.reason]} />
          <DetailField label="Product Lines" value={returnEntry.lineCount} />
          <DetailField label="Total Units" value={formatQuantity(returnEntry.totalUnits)} />
          <DetailField
            label="Notes"
            value={
              <span className="break-words whitespace-pre-wrap">{returnEntry.notes ?? '—'}</span>
            }
            className="sm:col-span-2"
          />
          <DetailField label="Created At" value={formatDateTime(returnEntry.createdAt)} />
          <DetailField label="Updated At" value={formatDateTime(returnEntry.updatedAt)} />
          {returnEntry.completedAt ? (
            <DetailField label="Completed At" value={formatDateTime(returnEntry.completedAt)} />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnEntry.lines.map((line, index) => (
                  <TableRow key={line.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      {line.productCodeSnapshot} - {line.productNameSnapshot}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(line.quantity)}
                    </TableCell>
                    <TableCell>{line.unit}</TableCell>
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
        title="Delete return draft?"
        description={`This will soft-delete "${returnEntry.returnNumber}". It will no longer appear in active lists but historical data is preserved.`}
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
        title="Complete Return"
        description={`Complete "${returnEntry.returnNumber}"? Product stock will be restored for ${returnEntry.lineCount} line${returnEntry.lineCount === 1 ? '' : 's'}. This cannot be undone.`}
        confirmLabel="Complete Return"
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
