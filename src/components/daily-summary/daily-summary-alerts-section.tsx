import { AlertTriangle, Bell, Info, PackageX } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DailySummaryDashboardAlert } from '@/types/daily-summary-dashboard';

type DailySummaryAlertsSectionProps = {
  alerts: DailySummaryDashboardAlert[];
};

const severityStyles = {
  info: 'border-border bg-muted/30',
  warning: 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
  critical: 'border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20',
} as const;

function AlertIcon({ alert }: { alert: DailySummaryDashboardAlert }) {
  switch (alert.severity) {
    case 'critical':
      return <PackageX className="size-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />;
    case 'warning':
      return (
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      );
    default:
      return <Info className="size-4 text-muted-foreground" aria-hidden="true" />;
  }
}

export function DailySummaryAlertsSection({ alerts }: DailySummaryAlertsSectionProps) {
  return (
    <section aria-labelledby="daily-summary-alerts-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="size-5 text-primary" aria-hidden="true" />
        <div>
          <h2 id="daily-summary-alerts-heading" className="text-lg font-semibold tracking-tight">
            What Needs Attention
          </h2>
          <p className="text-sm text-muted-foreground">
            Operational alerts for today&apos;s bakery activity.
          </p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No alerts right now. Operations look on track for today.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {alerts.map((alert) => (
            <Card key={alert.id} className={cn('gap-0 border', severityStyles[alert.severity])}>
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                <div className="mt-0.5 shrink-0">
                  <AlertIcon alert={alert} />
                </div>
                <CardTitle className="text-sm font-semibold leading-snug">{alert.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{alert.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
