'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type LineItemsGridColumn = {
  id: string;
  label: string;
  required?: boolean;
  srOnly?: boolean;
  className?: string;
};

type LineItemsGridProps = {
  columns: LineItemsGridColumn[];
  rowClassName: string;
  minWidthClassName?: string;
  children: ReactNode;
  className?: string;
};

export function LineItemsGrid({
  columns,
  rowClassName,
  minWidthClassName = 'min-w-[28rem]',
  children,
  className,
}: LineItemsGridProps) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border', className)}>
      <div className={cn(minWidthClassName)}>
        <div
          role="row"
          className={cn(
            'hidden border-b bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground lg:grid lg:gap-x-2',
            rowClassName,
          )}
        >
          {columns.map((column) => (
            <div
              key={column.id}
              role="columnheader"
              className={cn(column.srOnly && 'sr-only', column.className)}
            >
              {column.label}
              {column.required ? <span className="text-destructive"> *</span> : null}
            </div>
          ))}
        </div>
        <div className="divide-y">{children}</div>
      </div>
    </div>
  );
}

type LineItemsGridRowProps = {
  rowClassName: string;
  hasError?: boolean;
  children: ReactNode;
  className?: string;
};

export function LineItemsGridRow({
  rowClassName,
  hasError = false,
  children,
  className,
}: LineItemsGridRowProps) {
  return (
    <div
      role="row"
      className={cn(
        'grid grid-cols-1 gap-2 px-2 py-2 lg:gap-x-2 lg:py-1.5',
        rowClassName,
        hasError && 'bg-destructive/5',
        className,
      )}
    >
      {children}
    </div>
  );
}

type LineItemGridCellProps = {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

export function LineItemGridCell({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: LineItemGridCellProps) {
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground lg:sr-only">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground lg:hidden">{hint}</p>
      ) : null}
    </div>
  );
}
