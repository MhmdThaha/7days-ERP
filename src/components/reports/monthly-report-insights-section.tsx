import {
  AlertTriangle,
  Info,
  Lightbulb,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MonthlyReportInsight } from '@/types/monthly-report';

type MonthlyReportInsightsSectionProps = {
  insights: MonthlyReportInsight[];
};

const severityStyles = {
  positive: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20',
  negative: 'border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20',
  warning: 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
  neutral: 'border-border bg-muted/30',
} as const;

function InsightIcon({ insight }: { insight: MonthlyReportInsight }) {
  switch (insight.severity) {
    case 'positive':
      return <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />;
    case 'negative':
      return <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />;
    case 'warning':
      return <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />;
    default:
      return insight.type === 'best_seller' || insight.type === 'top_expense_category' ? (
        <Lightbulb className="size-4 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Info className="size-4 text-muted-foreground" aria-hidden="true" />
      );
  }
}

export function MonthlyReportInsightsSection({ insights }: MonthlyReportInsightsSectionProps) {
  if (insights.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="monthly-report-insights-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="size-5 text-primary" aria-hidden="true" />
        <div>
          <h2 id="monthly-report-insights-heading" className="text-lg font-semibold tracking-tight">
            What Needs Attention
          </h2>
          <p className="text-sm text-muted-foreground">
            Key highlights and alerts for this month.
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight) => (
          <Card
            key={insight.id}
            className={cn('gap-0 border', severityStyles[insight.severity])}
          >
            <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
              <div className="mt-0.5 shrink-0">
                <InsightIcon insight={insight} />
              </div>
              <CardTitle className="text-sm font-semibold leading-snug">{insight.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{insight.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
