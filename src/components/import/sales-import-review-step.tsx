'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import {
  computeImportReviewSummary,
  countUnresolvedIssues,
  SalesImportReview,
} from '@/components/import/review/sales-import-review';
import { ProductResolutionDialog } from '@/components/import/review/product-resolution-dialog';
import type { ImportReviewViewModel } from '@/lib/import/review/types';
import {
  applySingleRowResolution,
  extractDuplicateRowNumbers,
  isReadOnlyProductResolution,
  needsProductResolution,
  recalculateReviewRowAfterResolution,
  type ImportReviewViewModelWithResolution,
  type ProductResolutionAction,
  type ProductResolutionCatalogItem,
} from '@/lib/import/resolution';
import { buildProductMatchCatalog } from '@/lib/import/services/product-matching.service';
import type { ImportReviewRowViewModel } from '@/lib/import/review/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type SalesImportReviewStepProps = {
  initialViewModel: ImportReviewViewModel;
  catalogItems: readonly ProductResolutionCatalogItem[];
  stockByProductId?: Readonly<Record<string, number>>;
  onImport: (viewModel: ImportReviewViewModelWithResolution) => void;
  onBack: () => void;
  onStartOver: () => void;
  isImporting?: boolean;
};

export function SalesImportReviewStep({
  initialViewModel,
  catalogItems,
  stockByProductId,
  onImport,
  onBack,
  onStartOver,
  isImporting = false,
}: SalesImportReviewStepProps) {
  const [viewModel, setViewModel] = useState<ImportReviewViewModelWithResolution>(initialViewModel);
  const [activeRow, setActiveRow] = useState<ImportReviewRowViewModel | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const issuesSectionRef = useRef<HTMLDivElement>(null);

  const stockMap = useMemo(
    () => (stockByProductId ? new Map(Object.entries(stockByProductId)) : undefined),
    [stockByProductId],
  );

  const productCatalog = useMemo(
    () => buildProductMatchCatalog(catalogItems),
    [catalogItems],
  );

  const summary = useMemo(
    () => computeImportReviewSummary(viewModel.rows),
    [viewModel.rows],
  );
  const issueCount = countUnresolvedIssues(summary);

  const openResolution = useCallback((row: ImportReviewRowViewModel) => {
    setActiveRow(row);
    setDialogOpen(true);
  }, []);

  const applyResolution = useCallback(
    (action: ProductResolutionAction) => {
      if (!activeRow) {
        return;
      }

      const updatedRow = recalculateReviewRowAfterResolution({
        row: activeRow,
        action,
        catalogProducts: catalogItems,
        duplicateRowNumbers: extractDuplicateRowNumbers(activeRow),
        stockByProductId: stockMap,
      });

      setViewModel((current) => ({
        ...current,
        ...applySingleRowResolution(current, updatedRow),
      }));
    },
    [activeRow, catalogItems, stockMap],
  );

  function scrollToIssues() {
    issuesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleImportClick() {
    if (summary.importableCount === 0) {
      toast.error('No sales are ready to import yet. Resolve the issues below first.');
      scrollToIssues();
      return;
    }

    if (issueCount > 0) {
      toast.message(
        `${summary.importableCount.toLocaleString('en-IN')} ready sales will be imported. ${issueCount.toLocaleString('en-IN')} others will stay until you resolve them.`,
      );
    }

    onImport(viewModel);
  }

  const primaryImportLabel =
    summary.importableCount === 0
      ? 'Resolve issues'
      : summary.importableCount === summary.total
        ? `Import ${summary.importableCount.toLocaleString('en-IN')} Sales`
        : `Import ${summary.importableCount.toLocaleString('en-IN')} Ready Sales`;

  const actionBar = (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {summary.importableCount > 0
            ? issueCount > 0
              ? `${summary.importableCount.toLocaleString('en-IN')} sales are ready. ${issueCount.toLocaleString('en-IN')} need attention and will not be imported.`
              : 'All sales in this file are ready to import.'
            : 'Resolve the issues below before any sales can be imported.'}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onStartOver} disabled={isImporting}>
            <RotateCcw />
            Start over
          </Button>
          <Button variant="outline" onClick={onBack} disabled={isImporting}>
            Back to mapping
          </Button>
          {issueCount > 0 ? (
            <Button variant="secondary" onClick={scrollToIssues} disabled={isImporting}>
              Review {issueCount.toLocaleString('en-IN')} Issues
            </Button>
          ) : null}
          <Button
            onClick={handleImportClick}
            disabled={isImporting || summary.importableCount === 0}
          >
            {primaryImportLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <SalesImportReview
        viewModel={viewModel}
        onResolve={openResolution}
        needsResolution={needsProductResolution}
        isReadOnly={isReadOnlyProductResolution}
        issuesSectionRef={issuesSectionRef}
        actions={actionBar}
      />

      <ProductResolutionDialog
        row={activeRow}
        catalog={productCatalog}
        catalogItems={catalogItems}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onApply={applyResolution}
      />
    </div>
  );
}

export function extractSalesImportResolutions(
  viewModel: ImportReviewViewModelWithResolution,
) {
  return viewModel.rows
    .filter((row) => row.productResolution)
    .map((row) => ({
      rowNumber: row.rowNumber,
      action: row.productResolution!.action,
      selectedProductId: row.productResolution!.selectedProductId,
      placeholderProductName: row.productResolution!.placeholderProductName,
    }));
}
