import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DashboardStatCardProps = {
  title: string;
  value: ReactNode;
  description?: string;
  icon: LucideIcon;
  href?: string;
  variant?: 'hero' | 'metric' | 'primary' | 'compact';
  tone?: 'sales' | 'production' | 'pending' | 'expenses' | 'neutral';
  emphasis?: 'default' | 'warning' | 'success';
  className?: string;
};

const toneStyles = {
  sales: {
    card: 'border-primary/25 bg-primary/5 hover:border-primary/35 hover:bg-primary/8',
    iconWrap: 'rounded-lg bg-primary/10 text-primary',
  },
  production: {
    card: 'hover:border-muted-foreground/25 hover:bg-muted/30',
    iconWrap: 'rounded-lg bg-muted text-muted-foreground',
  },
  pending: {
    card: 'border-warning/25 bg-warning/5 hover:border-warning/35 hover:bg-warning/8',
    iconWrap: 'rounded-lg bg-warning/15 text-warning-foreground',
  },
  expenses: {
    card: 'hover:border-muted-foreground/25 hover:bg-muted/25',
    iconWrap: 'rounded-lg bg-muted text-muted-foreground',
  },
  neutral: {
    card: 'hover:border-muted-foreground/25 hover:bg-muted/25',
    iconWrap: 'rounded-lg bg-muted text-muted-foreground',
  },
} as const;

const variantConfig = {
  hero: {
    card: 'border-primary/25 bg-primary/5 hover:border-primary/40 hover:bg-primary/8 hover:shadow-md',
    body: 'flex h-full flex-col justify-between gap-4 p-6 sm:p-8',
    value: 'text-4xl font-bold tracking-tight text-foreground sm:text-5xl',
    title: 'text-lg font-semibold text-foreground',
    description: 'text-sm leading-relaxed text-muted-foreground',
    iconWrap: 'rounded-xl bg-primary/12 p-3 text-primary',
    icon: 'size-6',
    showCta: true,
  },
  metric: {
    card: 'hover:border-primary/25 hover:bg-muted/30 hover:shadow-sm',
    body: 'flex h-full flex-col gap-2 p-4 sm:p-5',
    value: 'text-2xl font-bold tracking-tight tabular-nums sm:text-3xl',
    title: 'text-sm font-medium text-muted-foreground',
    description: 'text-xs leading-relaxed text-muted-foreground',
    iconWrap: 'rounded-lg bg-muted p-2 text-muted-foreground',
    icon: 'size-4',
    showCta: false,
  },
  primary: {
    card: 'ring-foreground/10 hover:border-primary/35 hover:bg-muted/30 hover:shadow-md',
    body: 'flex flex-col gap-3 p-4',
    value: 'text-3xl font-bold tracking-tight',
    title: 'text-sm font-medium text-foreground/80',
    description: 'text-xs text-muted-foreground',
    iconWrap: 'rounded-lg bg-primary/10 p-2.5 text-primary',
    icon: 'size-5',
    showCta: true,
  },
  compact: {
    card: 'hover:border-muted-foreground/30 hover:bg-muted/25 hover:shadow-sm',
    body: 'flex flex-col gap-1.5 p-3 sm:p-4',
    value: 'text-xl font-bold tabular-nums sm:text-2xl',
    title: 'text-xs font-medium text-muted-foreground',
    description: 'text-xs text-muted-foreground',
    iconWrap: 'text-muted-foreground',
    icon: 'size-4',
    showCta: false,
  },
} as const;

export function DashboardStatCard({
  title,
  value,
  description,
  icon: Icon,
  href,
  variant = 'primary',
  tone = 'neutral',
  emphasis = 'default',
  className,
}: DashboardStatCardProps) {
  const config = variantConfig[variant];
  const toneConfig = toneStyles[tone];
  const isClickable = Boolean(href);

  const card = (
    <Card
      className={cn(
        'relative gap-0 transition-all duration-200',
        variant === 'metric' ? toneConfig.card : config.card,
        emphasis === 'warning' && tone !== 'pending' && 'border-warning/30 bg-warning/5',
        isClickable && 'cursor-pointer group/card',
        className,
      )}
    >
      <CardContent className={config.body}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className={cn('tabular-nums', config.value)}>{value}</div>
            <div>
              <p className={config.title}>{title}</p>
              {description ? <p className={cn('mt-1', config.description)}>{description}</p> : null}
            </div>
          </div>
          <div className={cn('shrink-0', variant === 'metric' ? toneConfig.iconWrap : config.iconWrap)}>
            <Icon className={config.icon} aria-hidden="true" />
          </div>
        </div>
        {emphasis === 'warning' ? (
          <Badge variant="warning" className="w-fit">
            Needs action
          </Badge>
        ) : null}
        {isClickable && config.showCta ? (
          <p className="flex items-center gap-1 text-sm font-medium text-primary">
            View details
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (!href) {
    return card;
  }

  return (
    <Link
      href={href}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`${title}. ${description ?? 'View details'}`}
    >
      {card}
    </Link>
  );
}
