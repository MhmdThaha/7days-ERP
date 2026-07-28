'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type EntryFormStickyFooterProps = {
  summary: ReactNode;
  actions?: ReactNode;
  className?: string;
  wrapperClassName?: string;
};

/**
 * Fixed footer for data-entry forms. Keeps totals and primary actions visible
 * while scrolling long line-item lists.
 */
export function EntryFormStickyFooter({
  summary,
  actions,
  className,
  wrapperClassName,
}: EntryFormStickyFooterProps) {
  return (
    <div className={wrapperClassName}>
      <div aria-hidden="true" className="h-20 shrink-0" />
      <div
        className={cn(
          'fixed bottom-0 z-30 border-t bg-background/95 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] backdrop-blur supports-[backdrop-filter]:bg-background/80',
          'left-0 right-0 md:left-[var(--sidebar-width)]',
          className,
        )}
      >
        <div className="mx-auto flex max-w-[var(--bos-container-content,100%)] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="min-w-0 flex-1">{summary}</div>
          {actions ? (
            <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
