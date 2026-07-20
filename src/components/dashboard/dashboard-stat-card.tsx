import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DashboardStatCardProps = {
  title: string;
  value: ReactNode;
  description?: string;
  icon: LucideIcon;
  href?: string;
  variant?: 'primary' | 'compact';
  className?: string;
};

const variantConfig = {
  primary: {
    card: 'ring-foreground/10 hover:border-primary/35 hover:bg-muted/30 hover:shadow-md',
    title: 'text-sm font-medium text-foreground/80',
    value: 'text-3xl font-bold tracking-tight',
    description: 'text-xs text-muted-foreground',
    iconWrap: 'rounded-lg bg-primary/10 p-2.5 text-primary',
    icon: 'size-5',
  },
  compact: {
    card: 'ring-foreground/8 hover:border-muted-foreground/30 hover:bg-muted/25 hover:shadow-sm',
    title: 'text-xs font-medium text-muted-foreground',
    value: 'text-lg font-semibold tabular-nums',
    description: 'text-xs text-muted-foreground',
    iconWrap: 'text-muted-foreground',
    icon: 'size-4',
  },
} as const;

export function DashboardStatCard({
  title,
  value,
  description,
  icon: Icon,
  href,
  variant = 'primary',
  className,
}: DashboardStatCardProps) {
  const config = variantConfig[variant];
  const isClickable = Boolean(href);

  const card = (
    <Card
      className={cn(
        'relative gap-0 transition-all duration-200',
        config.card,
        isClickable && 'cursor-pointer group/card',
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className={config.title}>{title}</CardTitle>
        <div className={cn('shrink-0', config.iconWrap)}>
          <Icon className={config.icon} aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn('tabular-nums', config.value)}>{value}</div>
        {description ? (
          <p className={cn('mt-1.5', config.description)}>{description}</p>
        ) : null}
        {isClickable && variant === 'primary' ? (
          <p className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-visible/card:opacity-100">
            View details
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
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
