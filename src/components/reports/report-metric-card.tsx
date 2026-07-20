import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ReportMetricCardProps = {
  title: string;
  value: ReactNode;
  description?: string;
  icon: LucideIcon;
  variant?: 'default' | 'emphasis';
  className?: string;
};

export function ReportMetricCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
  className,
}: ReportMetricCardProps) {
  return (
    <Card
      className={cn(
        'gap-0',
        variant === 'emphasis' && 'border-primary/30 bg-primary/5 ring-1 ring-primary/10',
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div
          className={cn(
            'shrink-0 rounded-lg p-2',
            variant === 'emphasis' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
        {description ? <p className="mt-1.5 text-xs text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
