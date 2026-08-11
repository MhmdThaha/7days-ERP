'use client';

import { useCallback, useMemo, useState } from 'react';

import { ImportReview } from '@/components/import/review/import-review';
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

type ImportReviewWithResolutionProps = {
  initialViewModel: ImportReviewViewModel;
  catalogItems: readonly ProductResolutionCatalogItem[];
  stockByProductId?: ReadonlyMap<string, number>;
};

/**
 * Import review with in-memory product resolution (Phase 8).
 * Re-calculates one row at a time — never rebuilds the full analysis pipeline.
 */
export function ImportReviewWithResolution({
  initialViewModel,
  catalogItems,
  stockByProductId,
}: ImportReviewWithResolutionProps) {
  const [viewModel, setViewModel] = useState<ImportReviewViewModelWithResolution>(initialViewModel);
  const [activeRow, setActiveRow] = useState<ImportReviewRowViewModel | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const productCatalog = useMemo(
    () => buildProductMatchCatalog(catalogItems),
    [catalogItems],
  );

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
        stockByProductId,
      });

      setViewModel((current) => ({
        ...current,
        ...applySingleRowResolution(current, updatedRow),
      }));
    },
    [activeRow, catalogItems, stockByProductId],
  );

  return (
    <>
      <ImportReview
        viewModel={viewModel}
        resolution={{
          onResolve: openResolution,
          needsResolution: needsProductResolution,
          isReadOnly: isReadOnlyProductResolution,
        }}
      />

      <ProductResolutionDialog
        row={activeRow}
        catalog={productCatalog}
        catalogItems={catalogItems}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onApply={applyResolution}
      />
    </>
  );
}
