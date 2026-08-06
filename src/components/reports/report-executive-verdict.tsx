import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ReportExecutiveVerdictProps = {
  title: string;
  subtitle?: string;
  message: ReactNode;
  tone: 'success' | 'warning' | 'destructive' | 'neutral';
};

const verdictToneClass = {
  success: 'border-success/30 bg-success/5 text-success-foreground',
  warning: 'border-warning/30 bg-warning/5 text-warning-foreground',
  destructive: 'border-destructive/30 bg-destructive/5 text-destructive',
  neutral: 'border-border bg-muted/30 text-foreground',
} as const;

const verdictDotClass = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground',
} as const;

export function ReportExecutiveVerdict({
  title,
  subtitle,
  message,
  tone,
}: ReportExecutiveVerdictProps) {
  return (
    <section aria-labelledby="report-verdict-heading" className="space-y-2">
      <div className="space-y-1">
        <h1 id="report-verdict-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {subtitle ? <p className="text-sm text-muted-foreground md:text-base">{subtitle}</p> : null}
      </div>

      <div
        className={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-4 sm:px-5 sm:py-5',
          verdictToneClass[tone],
        )}
      >
        <span
          className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', verdictDotClass[tone])}
          aria-hidden="true"
        />
        <p className="text-base font-medium leading-relaxed sm:text-lg">{message}</p>
      </div>
    </section>
  );
}
