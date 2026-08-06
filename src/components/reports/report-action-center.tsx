import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type ReportActionItem = {
  id: string;
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'destructive' | 'neutral';
};

type ReportActionCenterProps = {
  items: ReportActionItem[];
  emptyTitle?: string;
  emptyDescription?: string;
};

const itemToneClass = {
  success: 'border-success/30 bg-success/5',
  warning: 'border-warning/30 bg-warning/5',
  destructive: 'border-destructive/30 bg-destructive/5',
  neutral: 'border-border bg-muted/30',
} as const;

const itemDotClass = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground',
} as const;

function AllClearCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="gap-0 rounded-xl border-success/30 bg-success/5">
      <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <p className="text-base font-semibold text-success-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function ReportActionCenter({
  items,
  emptyTitle = 'All clear',
  emptyDescription = 'Nothing needs your attention right now.',
}: ReportActionCenterProps) {
  return (
    <section aria-labelledby="report-action-center-heading" className="section-stack">
      <div className="space-y-1">
        <h2 id="report-action-center-heading" className="text-lg font-semibold tracking-tight">
          Action Center
        </h2>
        <p className="text-sm text-muted-foreground">What needs your attention.</p>
      </div>

      {items.length === 0 ? (
        <AllClearCard title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className={cn('gap-0 rounded-xl border', itemToneClass[item.tone])}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', itemDotClass[item.tone])}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold leading-snug">{item.title}</p>
                    {item.description ? (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

export type ReportOperationalMetric = {
  label: string;
  value: ReactNode;
  description?: string;
  icon: LucideIcon;
};

export function ReportOperationalMetricsStrip({ metrics }: { metrics: ReportOperationalMetric[] }) {
  return (
    <section aria-labelledby="report-operational-metrics-heading" className="section-stack">
      <div className="space-y-1">
        <h2 id="report-operational-metrics-heading" className="text-lg font-semibold tracking-tight">
          Operational Metrics
        </h2>
        <p className="text-sm text-muted-foreground">Activity counts for the period.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <div
              key={metric.label}
              className="flex items-start gap-3 rounded-xl border bg-card px-4 py-4"
            >
              <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{metric.value}</p>
                {metric.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{metric.description}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ReportFinancialDetailsSection({
  children,
  description,
}: {
  children: ReactNode;
  description?: string;
}) {
  return (
    <section aria-labelledby="report-financial-details-heading" className="section-stack">
      <details className="group rounded-xl border bg-muted/20">
        <summary className="cursor-pointer list-none px-5 py-4 marker:content-none sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="report-financial-details-heading" className="text-lg font-semibold tracking-tight">
                Financial Details
              </h2>
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <span className="text-sm font-medium text-primary group-open:hidden">Show details</span>
            <span className="hidden text-sm font-medium text-primary group-open:inline">Hide details</span>
          </div>
        </summary>
        <div className="border-t px-5 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div>
      </details>
    </section>
  );
}
