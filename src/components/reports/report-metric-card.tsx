import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { ReportKpiValue } from '@/components/reports/report-kpi-value';
import {
  reportMetricValueClass,
  reportToneIconClass,
  type ReportTone,
} from '@/components/reports/report-tone-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ReportMetricCardProps = {
  title: string;
  value: ReactNode;
  description?: string;
  icon: LucideIcon;
  variant?: 'default' | 'emphasis';
  tone?: ReportTone | 'wastage';
  profitAmount?: number;
  className?: string;
};

export function ReportMetricCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
  tone,
  profitAmount,
  className,
}: ReportMetricCardProps) {
  const valueToneClass = reportMetricValueClass(tone, profitAmount);
  const iconTone = tone && tone !== 'wastage' ? tone : tone === 'wastage' ? 'warning' : undefined;

  return (
    <Card
      className={cn(
        'h-full min-w-0 gap-0',
        variant === 'emphasis' && 'border-primary/30 bg-primary/5 ring-1 ring-primary/10',
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div
          className={cn(
            'shrink-0 rounded-lg p-2',
            iconTone
              ? reportToneIconClass[iconTone]
              : variant === 'emphasis'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-1 flex-col">
        <ReportKpiValue variant="secondary" className={valueToneClass}>
          {value}
        </ReportKpiValue>
        {description ? <p className="mt-1.5 text-xs text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
