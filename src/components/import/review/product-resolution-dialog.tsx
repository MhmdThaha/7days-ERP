'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ImportReviewRowViewModel } from '@/lib/import/review/types';
import {
  getProductResolutionCase,
  getResolutionCandidates,
  PRODUCT_RESOLUTION_CASE,
  type ProductResolutionAction,
  type ProductResolutionCatalogItem,
} from '@/lib/import/resolution';
import type { ProductMatchCatalog } from '@/lib/import/services/product-matching.service';
import { cn } from '@/lib/utils';

type ProductResolutionDialogProps = {
  row: ImportReviewRowViewModel | null;
  catalog: ProductMatchCatalog;
  catalogItems: readonly ProductResolutionCatalogItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (action: ProductResolutionAction) => void;
};

function readOriginal(row: ImportReviewRowViewModel, field: string): string {
  const normalized = row.normalizedValues[field];
  const original = row.originalValues[field];

  if (typeof normalized === 'string' && normalized.trim()) {
    return normalized;
  }

  if (typeof original === 'string' && original.trim()) {
    return original;
  }

  return '—';
}

export function ProductResolutionDialog({
  row,
  catalog,
  catalogItems,
  open,
  onOpenChange,
  onApply,
}: ProductResolutionDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [placeholderName, setPlaceholderName] = useState('');
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const [showFileDetails, setShowFileDetails] = useState(false);

  const resolutionCase = row ? getProductResolutionCase(row) : PRODUCT_RESOLUTION_CASE.NONE;
  const suggestedProductId = row?.productMatchResult?.matchedProductId ?? null;
  const suggestedProductName = row?.productMatchResult?.matchedProductName ?? null;
  const fileProductName = row ? readOriginal(row, 'productName') : '—';
  const candidates = useMemo(
    () => (row ? getResolutionCandidates(row, catalog) : []),
    [row, catalog],
  );

  const searchableCatalog = useMemo(() => {
    if (resolutionCase === PRODUCT_RESOLUTION_CASE.FUZZY_MATCH && !showFullCatalog) {
      return candidates.map(
        (product) =>
          catalogItems.find((item) => item.id === product.id) ?? {
            ...product,
            category: undefined,
          },
      );
    }

    if (
      resolutionCase === PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT ||
      resolutionCase === PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT ||
      (resolutionCase === PRODUCT_RESOLUTION_CASE.FUZZY_MATCH && showFullCatalog)
    ) {
      return catalogItems;
    }

    return candidates.map(
      (product) =>
        catalogItems.find((item) => item.id === product.id) ?? {
          ...product,
          category: undefined,
        },
    );
  }, [resolutionCase, catalogItems, candidates, showFullCatalog]);

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return searchableCatalog;
    }

    return searchableCatalog.filter((product) => {
      const haystack = [product.name, product.code, product.category ?? '', product.unit ?? '']
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [search, searchableCatalog]);

  const readOnly = resolutionCase === PRODUCT_RESOLUTION_CASE.SYSTEM_CONFIGURATION_ERROR;
  const showCatalogPicker =
    resolutionCase === PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT ||
    resolutionCase === PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES ||
    resolutionCase === PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT ||
    (resolutionCase === PRODUCT_RESOLUTION_CASE.FUZZY_MATCH && showFullCatalog);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSearch('');
      setSelectedProductId(null);
      setPlaceholderName('');
      setShowFullCatalog(false);
      setShowFileDetails(false);
    }

    onOpenChange(nextOpen);
  }

  function handleUseSuggestedProduct() {
    if (!suggestedProductId || !row) {
      return;
    }

    onApply({ type: 'select-existing', productId: suggestedProductId });
    handleOpenChange(false);
  }

  function handleApplySelect() {
    if (!selectedProductId || !row) {
      return;
    }

    if (resolutionCase === PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT) {
      const matchedId = row.productMatchResult?.matchedProductId;

      if (matchedId && selectedProductId === matchedId) {
        onApply({ type: 'accept-inactive', productId: selectedProductId });
      } else {
        onApply({ type: 'select-existing', productId: selectedProductId });
      }
    } else {
      onApply({ type: 'select-existing', productId: selectedProductId });
    }

    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-3xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>Which product is this?</DialogTitle>
          <DialogDescription>
            Choose the BakeryOS product for this sale. Nothing is saved until you import.
          </DialogDescription>
        </DialogHeader>

        {row ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">File says</p>
              <p className="mt-1 text-base font-medium">{fileProductName}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-auto px-0"
                onClick={() => setShowFileDetails((current) => !current)}
              >
                {showFileDetails ? 'Hide file details' : 'View file details'}
              </Button>
              {showFileDetails ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Product code in file</dt>
                    <dd className="font-medium">{readOriginal(row, 'productCode')}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Barcode in file</dt>
                    <dd className="font-medium">{readOriginal(row, 'barcode')}</dd>
                  </div>
                </dl>
              ) : null}
            </div>

            {readOnly ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
                <p className="font-medium text-destructive">Cannot fix here</p>
                <p className="mt-1 text-muted-foreground">
                  Duplicate barcodes or product names in BakeryOS must be fixed in master data.
                </p>
              </div>
            ) : (
              <>
                {resolutionCase === PRODUCT_RESOLUTION_CASE.FUZZY_MATCH ? (
                  <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
                    <p className="text-muted-foreground">BakeryOS suggests:</p>
                    <p className="text-base font-medium">{suggestedProductName ?? '—'}</p>
                    <p className="text-muted-foreground">Is this correct?</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={!suggestedProductId}
                        onClick={handleUseSuggestedProduct}
                      >
                        Yes, use {suggestedProductName ?? 'suggested product'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowFullCatalog(true);
                          setSelectedProductId(null);
                        }}
                      >
                        Choose another product
                      </Button>
                    </div>
                  </div>
                ) : null}

                {resolutionCase === PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT ? (
                  <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
                    <p className="font-medium text-destructive">Product not found</p>
                    <p className="text-muted-foreground">
                      Choose an existing BakeryOS product, create a placeholder, or skip this sale.
                    </p>
                  </div>
                ) : null}

                {resolutionCase === PRODUCT_RESOLUTION_CASE.MULTIPLE_MATCHES ? (
                  <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
                    <p className="text-muted-foreground">
                      {row.productMatchResult?.reason?.includes('name and product code')
                        ? 'The product name and product code in your file point to different BakeryOS products. Choose the correct one.'
                        : 'BakeryOS found more than one possible product. Choose the correct one.'}
                    </p>
                    <p className="font-medium">Possible BakeryOS products:</p>
                  </div>
                ) : null}

                {resolutionCase === PRODUCT_RESOLUTION_CASE.INACTIVE_PRODUCT ? (
                  <p className="text-sm text-warning-foreground">
                    The matched product is inactive. Accept it or choose another product.
                  </p>
                ) : null}

                {showCatalogPicker ? (
                  <>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search products…"
                        aria-label="Search product catalog"
                        className="pl-9"
                      />
                    </div>

                    <div className="max-h-64 overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <span className="sr-only">Select</span>
                            </TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCatalog.map((product) => {
                            const isSelected = selectedProductId === product.id;

                            return (
                              <TableRow
                                key={product.id}
                                className={cn(isSelected && 'bg-muted/40')}
                                onClick={() => setSelectedProductId(product.id)}
                              >
                                <TableCell>
                                  <input
                                    type="radio"
                                    name="product-resolution-choice"
                                    checked={isSelected}
                                    aria-label={`Select ${product.name}`}
                                    onChange={() => setSelectedProductId(product.id)}
                                  />
                                </TableCell>
                                <TableCell>{product.name}</TableCell>
                                <TableCell>{product.code || '—'}</TableCell>
                                <TableCell>
                                  <Badge variant={product.isActive ? 'success' : 'warning'}>
                                    {product.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {resolutionCase === PRODUCT_RESOLUTION_CASE.UNKNOWN_PRODUCT ? (
                      <div className="space-y-2 rounded-lg border p-3">
                        <Label htmlFor="placeholder-product-name">
                          Create new product (placeholder)
                        </Label>
                        <Input
                          id="placeholder-product-name"
                          value={placeholderName}
                          onChange={(event) => setPlaceholderName(event.target.value)}
                          placeholder={fileProductName}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onApply({
                              type: 'create-placeholder',
                              productName:
                                placeholderName.trim() || fileProductName || 'New product',
                            });
                            handleOpenChange(false);
                          }}
                        >
                          Use placeholder product
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          {!readOnly && row ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  onApply({ type: 'skip-row' });
                  handleOpenChange(false);
                }}
              >
                Skip row
              </Button>
              {resolutionCase === PRODUCT_RESOLUTION_CASE.FUZZY_MATCH && !showFullCatalog ? null : (
                <Button disabled={!selectedProductId} onClick={handleApplySelect}>
                  Use selected product
                </Button>
              )}
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
