'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LineItemDeleteCellProps = {
  onRemove: () => void;
  disabled?: boolean;
  label: string;
  className?: string;
};

export function LineItemDeleteCell({
  onRemove,
  disabled = false,
  label,
  className,
}: LineItemDeleteCellProps) {
  return (
    <div className={cn('flex items-start justify-end lg:items-center', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={disabled}
        aria-label={label}
        className="shrink-0"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

type LineItemReorderActionsCellProps = {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
  index: number;
  className?: string;
};

export function LineItemReorderActionsCell({
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
  disabled = false,
  index,
  className,
}: LineItemReorderActionsCellProps) {
  return (
    <div className={cn('flex items-start justify-end gap-0.5 lg:items-center', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onMoveUp}
        disabled={disabled || !canMoveUp}
        aria-label={`Move row ${index + 1} up`}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onMoveDown}
        disabled={disabled || !canMoveDown}
        aria-label={`Move row ${index + 1} down`}
      >
        <ChevronDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove row ${index + 1}`}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

type LineItemUnitCellProps = {
  unit: string;
  id: string;
};

export function LineItemUnitCell({ unit, id }: LineItemUnitCellProps) {
  return (
    <span
      id={id}
      className="flex h-8 items-center truncate px-1 text-sm tabular-nums text-muted-foreground"
      aria-readonly="true"
    >
      {unit || '—'}
    </span>
  );
}

type LineItemUnitSelectProps = {
  id: string;
  value: string;
  options: readonly string[];
  disabled?: boolean;
  onValueChange: (unit: string) => void;
};

/** Dropdown for weight/volume-compatible units; falls back to read-only when no options. */
export function LineItemUnitSelect({
  id,
  value,
  options,
  disabled = false,
  onValueChange,
}: LineItemUnitSelectProps) {
  if (options.length === 0) {
    return <LineItemUnitCell id={id} unit={value} />;
  }

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label="Unit"
      className="flex h-8 w-full min-w-[4.5rem] rounded-md border border-input bg-transparent px-2 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

type LineItemTotalCellProps = {
  id: string;
  children: React.ReactNode;
};

export function LineItemTotalCell({ id, children }: LineItemTotalCellProps) {
  return (
    <div
      id={id}
      className="flex h-8 items-center rounded-md border bg-muted/30 px-2 text-sm tabular-nums"
    >
      {children}
    </div>
  );
}
