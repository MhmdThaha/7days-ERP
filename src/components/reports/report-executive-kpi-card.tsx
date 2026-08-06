import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import {
  formatTrendPercent,
  getTrendDirection,
  profitValueClass,
  reportToneCardClass,
  reportToneIconClass,
  reportToneValueClass,
  trendTextClass,
  type ReportTone,
} from '@/components/reports/report-tone-utils';
import { Card, CardContent } from '@/components/ui/card';
import { ReportKpiValue, reportExecutiveKpiGridClass } from '@/components/reports/report-kpi-value';
import { cn } from '@/lib/utils';

type ReportExecutiveKpiCardProps = {
  title: string;
  value: ReactNode;
  description: string;
  icon: LucideIcon;
  tone?: ReportTone;
  profitAmount?: number;
  trendPercent?: number | null;
  invertTrend?: boolean;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

function TrendIndicator({
  trendPercent,
  invertTrend,
}: {
  trendPercent: number | null | undefined;
  invertTrend?: boolean;
}) {
  const label = formatTrendPercent(trendPercent ?? null);

  if (label === null) {
    return null;
  }

  const direction = getTrendDirection(trendPercent ?? null);
  const TrendIcon =
    direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;

  return (
    <div className="space-y-0.5">
      <p className={cn('flex items-center gap-1 text-sm font-semibold tabular-nums', trendTextClass(trendPercent ?? null, invertTrend))}>
        <TrendIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </p>
      <p className="text-xs text-muted-foreground">Compared to last month</p>
    </div>
  );
}

export function ReportExecutiveKpiCard({
  title,
  value,
  description,
  icon: Icon,
  tone = 'neutral',
  profitAmount,
  trendPercent,
  invertTrend,
  actionHref,
  actionLabel = 'View',
  className,
}: ReportExecutiveKpiCardProps) {
  const valueToneClass =
    profitAmount !== undefined ? profitValueClass(profitAmount) : reportToneValueClass[tone];

  return (
    <Card className={cn('h-full min-w-0 gap-0 rounded-xl', reportToneCardClass[tone], className)}>
      <CardContent className="flex h-full min-w-0 flex-col gap-5 p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-medium text-muted-foreground">{title}</p>
          <div className={cn('shrink-0 rounded-lg p-2.5', reportToneIconClass[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <ReportKpiValue variant="executive" className={valueToneClass}>
            {value}
          </ReportKpiValue>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          <TrendIndicator trendPercent={trendPercent} invertTrend={invertTrend} />
        </div>

        {actionHref ? (
          <Link
            href={actionHref}
            className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {actionLabel}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ReportExecutiveKpiGrid({ children }: { children: ReactNode }) {
  return <div className={cn(reportExecutiveKpiGridClass, '[&>*]:h-full')}>{children}</div>;
}
