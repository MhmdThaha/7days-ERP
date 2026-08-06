import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ReportKpiValueProps = {
  children: ReactNode;
  className?: string;
  /** Primary financial metrics — largest clamp range */
  variant?: 'executive' | 'primary' | 'secondary';
};

const variantClasses = {
  executive: 'text-[clamp(1.25rem,1.75vw+0.5rem,2.5rem)]',
  primary: 'text-[clamp(1.125rem,1.5vw+0.5rem,2.25rem)]',
  secondary: 'text-[clamp(1rem,1.1vw+0.45rem,1.375rem)]',
} as const;

const minHeights = {
  executive: 'min-h-[3.5rem] sm:min-h-[3.75rem]',
  primary: 'min-h-[3.25rem] sm:min-h-[3.5rem]',
  secondary: 'min-h-[2rem]',
} as const;

export function ReportKpiValue({
  children,
  className,
  variant = 'primary',
}: ReportKpiValueProps) {
  return (
    <div className={cn('min-w-0 overflow-hidden', minHeights[variant])}>
      <p
        className={cn(
          'max-w-full font-bold leading-tight tracking-tight tabular-nums',
          variantClasses[variant],
          className,
        )}
      >
        <span className="block max-w-full truncate">{children}</span>
      </p>
    </div>
  );
}

export const reportPrimaryMetricGridClass =
  'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,13.5rem),1fr))]';

export const reportExecutiveKpiGridClass =
  'grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]';
