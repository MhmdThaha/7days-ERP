import type { ReactNode } from 'react';

export type ReportTone = 'sales' | 'profit' | 'production' | 'expense' | 'warning' | 'neutral';

export type ReportBarTone = 'sales' | 'profit' | 'production' | 'expense' | 'wastage';

export function getProfitTone(amount: number): 'profit' | 'neutral' | 'loss' {
  if (amount > 0) {
    return 'profit';
  }

  if (amount < 0) {
    return 'loss';
  }

  return 'neutral';
}

export function formatTrendPercent(changePercent: number | null): string | null {
  if (changePercent === null) {
    return null;
  }

  if (changePercent === 0) {
    return '0.0%';
  }

  const sign = changePercent > 0 ? '+' : '';
  return `${sign}${changePercent.toFixed(1)}%`;
}

export function getTrendDirection(
  changePercent: number | null,
): 'up' | 'down' | 'flat' | 'none' {
  if (changePercent === null) {
    return 'none';
  }

  if (changePercent > 0) {
    return 'up';
  }

  if (changePercent < 0) {
    return 'down';
  }

  return 'flat';
}

export const reportToneCardClass: Record<ReportTone, string> = {
  sales: 'border-primary/25 bg-primary/5',
  profit: 'border-success/30 bg-success/5',
  production: 'border-primary/20 bg-primary/[0.03]',
  expense: 'border-warning/25 bg-warning/5',
  warning: 'border-warning/30 bg-warning/5',
  neutral: 'border-border bg-card',
};

export const reportToneIconClass: Record<ReportTone, string> = {
  sales: 'bg-primary/10 text-primary',
  profit: 'bg-success/15 text-success',
  production: 'bg-primary/10 text-primary',
  expense: 'bg-warning/15 text-warning-foreground',
  warning: 'bg-warning/15 text-warning-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

/** Semantic color for KPI values — labels/descriptions stay muted. */
export const reportToneValueClass: Record<ReportTone, string | undefined> = {
  sales: 'text-primary',
  profit: 'text-success',
  production: 'text-primary',
  expense: 'text-warning-foreground',
  warning: 'text-warning-foreground',
  neutral: undefined,
};

export function reportMetricValueClass(
  tone?: ReportTone | 'wastage',
  profitAmount?: number,
): string | undefined {
  if (profitAmount !== undefined) {
    return profitValueClass(profitAmount);
  }

  if (tone === 'wastage') {
    return 'text-warning-foreground';
  }

  if (tone) {
    return reportToneValueClass[tone];
  }

  return undefined;
}

export const reportBarToneClass: Record<ReportBarTone, string> = {
  sales: 'bg-primary/80',
  profit: 'bg-success/80',
  production: 'bg-primary/70',
  expense: 'bg-warning/80',
  wastage: 'bg-destructive/75',
};

export function profitValueClass(amount: number): string {
  const tone = getProfitTone(amount);

  if (tone === 'profit') {
    return 'text-success';
  }

  if (tone === 'loss') {
    return 'text-destructive';
  }

  return 'text-muted-foreground';
}

export function trendTextClass(changePercent: number | null, invert = false): string {
  const direction = getTrendDirection(changePercent);

  if (direction === 'none' || direction === 'flat') {
    return 'text-muted-foreground';
  }

  const isPositive = direction === 'up';
  const good = invert ? !isPositive : isPositive;

  return good ? 'text-success' : 'text-destructive';
}

export type ReportKpiItem = {
  title: string;
  value: ReactNode;
  description: string;
  tone: ReportTone;
  profitAmount?: number;
  trendPercent?: number | null;
  trendLabel?: string;
  invertTrend?: boolean;
  actionHref?: string;
  actionLabel?: string;
};
