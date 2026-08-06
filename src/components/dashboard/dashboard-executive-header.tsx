import { cn } from '@/lib/utils';

type DashboardExecutiveHeaderProps = {
  todayDate: string;
  lowStockCount: number;
  pendingDraftTotal: number;
};

function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

function formatExecutiveDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);

  if (!year || !month || !day) {
    return dateString;
  }

  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function DashboardExecutiveHeader({
  todayDate,
  lowStockCount,
  pendingDraftTotal,
}: DashboardExecutiveHeaderProps) {
  const needsAttention = lowStockCount > 0 || pendingDraftTotal > 0;
  const dateLabel = formatExecutiveDate(todayDate);

  const statusMessage = needsAttention
    ? [
        lowStockCount > 0
          ? `${lowStockCount.toLocaleString('en-IN')} low-stock ${lowStockCount === 1 ? 'product' : 'products'}`
          : null,
        pendingDraftTotal > 0
          ? `${pendingDraftTotal.toLocaleString('en-IN')} pending ${pendingDraftTotal === 1 ? 'draft' : 'drafts'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Today looks healthy';

  return (
    <header className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{getTimeGreeting()}</h1>
          <p className="text-sm text-muted-foreground md:text-base">{dateLabel}</p>
        </div>
      </div>

      <div
        className={cn(
          'flex items-center gap-2.5 rounded-xl border px-4 py-3',
          needsAttention
            ? 'border-warning/30 bg-warning/5'
            : 'border-success/30 bg-success/5',
        )}
      >
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            needsAttention ? 'bg-warning' : 'bg-success',
          )}
          aria-hidden="true"
        />
        <p
          className={cn(
            'text-sm font-medium md:text-base',
            needsAttention ? 'text-warning-foreground' : 'text-success-foreground',
          )}
        >
          {statusMessage}
        </p>
      </div>
    </header>
  );
}
