'use client';

import { MoreHorizontal, Pencil, SearchX, Trash2 } from 'lucide-react';

import { LowStockBadge } from '@/components/shared/low-stock-badge';
import { MoneyDisplay } from '@/components/shared/money-display';
import { StatusBadge } from '@/components/shared/status-badge';
import { TruncatedText } from '@/components/shared/truncated-text';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AVERAGE_COST_HELP_TEXT } from '@/lib/domain/constants/inventory';
import { cn } from '@/lib/utils';
import type { RawMaterialListItem } from '@/types/raw-material';

type RawMaterialTableProps = {
  rawMaterials: RawMaterialListItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  disabled?: boolean;
  onEdit: (rawMaterialId: string) => void;
  onDelete: (rawMaterial: RawMaterialListItem) => void;
};

const TABLE_COLUMNS = [
  'Code',
  'Name',
  'Category',
  'Unit',
  'Current Stock',
  'Avg. Cost',
  'Reorder',
  'Status',
  'Actions',
];

function isLowStock(rawMaterial: RawMaterialListItem): boolean {
  if (rawMaterial.reorderLevel === null) {
    return false;
  }

  return rawMaterial.currentStock <= rawMaterial.reorderLevel;
}

function RawMaterialTableSkeleton() {
  return (
    <Table>
        <TableHeader>
          <TableRow>
            {TABLE_COLUMNS.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              {TABLE_COLUMNS.map((column) => (
                <TableCell key={column}>
                  <Skeleton className="h-4 w-full max-w-[120px]" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
  );
}

function formatStock(quantity: number, unit: string): string {
  return `${quantity} ${unit}`;
}

function InventoryColumnHeader({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="cursor-help border-b border-dotted border-muted-foreground/50">
            {label}
          </span>
        }
      />
      <TooltipContent side="top" className="max-w-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function AverageCostCell({ amount }: { amount: number }) {
  if (amount <= 0) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="text-muted-foreground" tabIndex={0}>
              —
            </span>
          }
        />
        <TooltipContent side="top" className="max-w-xs">
          {AVERAGE_COST_HELP_TEXT}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="cursor-help" tabIndex={0}>
            <MoneyDisplay amount={amount} />
          </span>
        }
      />
      <TooltipContent side="top" className="max-w-xs">
        {AVERAGE_COST_HELP_TEXT}
      </TooltipContent>
    </Tooltip>
  );
}

export function RawMaterialTable({
  rawMaterials,
  isLoading,
  isFetching = false,
  disabled = false,
  onEdit,
  onDelete,
}: RawMaterialTableProps) {
  if (isLoading) {
    return <RawMaterialTableSkeleton />;
  }

  return (
    <TooltipProvider delay={300}>
      <div
        className={cn(
          'relative max-h-[min(70vh,640px)] overflow-auto',
          isFetching && 'opacity-70 transition-opacity',
        )}
        aria-busy={isFetching}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
            <TableRow>
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead className="min-w-[140px]">Name</TableHead>
              <TableHead className="hidden w-[130px] md:table-cell">Category</TableHead>
              <TableHead className="hidden w-[64px] sm:table-cell">Unit</TableHead>
              <TableHead className="min-w-[108px]">
                <InventoryColumnHeader
                  label="Current Stock"
                  tooltip="Updated automatically when you record Purchases (in) and Production (out)."
                />
              </TableHead>
              <TableHead className="hidden min-w-[96px] sm:table-cell">
                <InventoryColumnHeader label="Avg. Cost" tooltip={AVERAGE_COST_HELP_TEXT} />
              </TableHead>
              <TableHead className="hidden w-[88px] lg:table-cell">Reorder</TableHead>
              <TableHead className="min-w-[130px]">Status</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rawMaterials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <SearchX className="size-8 opacity-50" aria-hidden="true" />
                    <p className="text-sm">No raw materials to display.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rawMaterials.map((rawMaterial) => (
                <TableRow key={rawMaterial.id} className="group hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <TruncatedText
                      text={rawMaterial.code}
                      maxWidthClassName="max-w-[100px]"
                      className="font-mono text-xs sm:text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <TruncatedText text={rawMaterial.name} maxWidthClassName="max-w-[200px]" />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <TruncatedText
                      text={rawMaterial.category}
                      maxWidthClassName="max-w-[130px]"
                    />
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{rawMaterial.unit}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatStock(rawMaterial.currentStock, rawMaterial.unit)}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">
                    <AverageCostCell amount={rawMaterial.averageCost} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap tabular-nums lg:table-cell">
                    {rawMaterial.reorderLevel !== null
                      ? `${rawMaterial.reorderLevel} ${rawMaterial.unit}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[140px] flex-wrap items-center gap-1.5">
                      <StatusBadge isActive={rawMaterial.isActive} />
                      {isLowStock(rawMaterial) ? <LowStockBadge /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        aria-label={`Actions for ${rawMaterial.name}`}
                        disabled={disabled}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(rawMaterial.id)} disabled={disabled}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(rawMaterial)}
                          disabled={disabled}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
