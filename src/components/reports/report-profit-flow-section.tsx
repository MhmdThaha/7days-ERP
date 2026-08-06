import { ArrowDown } from 'lucide-react';

import { MoneyDisplay } from '@/components/shared/money-display';
import { profitValueClass } from '@/components/reports/report-tone-utils';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type ReportProfitFlowStep = {
  label: string;
  amount: number;
  description?: string;
  tone: 'sales' | 'expense' | 'profit' | 'wastage' | 'neutral';
};

type ReportProfitFlowSectionProps = {
  steps: ReportProfitFlowStep[];
  description?: string;
};

const stepToneClass = {
  sales: 'text-primary',
  expense: 'text-warning-foreground',
  profit: 'text-success',
  wastage: 'text-destructive',
  neutral: 'text-muted-foreground',
} as const;

const stepBorderClass = {
  sales: 'border-l-primary',
  expense: 'border-l-warning',
  profit: 'border-l-success',
  wastage: 'border-l-destructive',
  neutral: 'border-l-border',
} as const;

const stepBackgroundClass = {
  sales: 'bg-primary/[0.03]',
  expense: 'bg-warning/[0.04]',
  profit: 'bg-success/[0.04]',
  wastage: 'bg-destructive/[0.04]',
  neutral: 'bg-card',
} as const;

function FlowStep({
  step,
  isLast,
  isHero,
}: {
  step: ReportProfitFlowStep;
  isLast: boolean;
  isHero: boolean;
}) {
  const amountClass =
    step.tone === 'profit' ? profitValueClass(step.amount) : stepToneClass[step.tone];

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'w-full rounded-xl border border-l-4 px-5 py-4 sm:px-6',
          stepBorderClass[step.tone],
          stepBackgroundClass[step.tone],
          isHero && step.tone === 'profit' && step.amount > 0 && 'border-success/30 bg-success/8 py-6',
          isHero && step.tone === 'profit' && step.amount < 0 && 'border-destructive/30 bg-destructive/8 py-6',
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className={cn('font-medium text-muted-foreground', isHero ? 'text-base' : 'text-sm')}>
              {step.label}
            </p>
            {step.description ? (
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            ) : null}
          </div>
          <p
            className={cn(
              'shrink-0 font-bold tabular-nums',
              isHero ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl',
              amountClass,
            )}
          >
            <MoneyDisplay amount={step.amount} />
          </p>
        </div>
      </div>
      {!isLast ? (
        <ArrowDown className="my-3 size-4 text-muted-foreground/60" aria-hidden="true" />
      ) : null}
    </div>
  );
}

export function ReportProfitFlowSection({
  steps,
  description = "How today's sales became profit — step by step.",
}: ReportProfitFlowSectionProps) {
  return (
    <section aria-labelledby="report-profit-flow-heading" className="section-stack">
      <div className="space-y-1">
        <h2 id="report-profit-flow-heading" className="text-lg font-semibold tracking-tight">
          Profit Flow
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="gap-0 rounded-xl border bg-muted/20">
        <CardContent className="space-y-0 py-6 sm:px-6 sm:py-8">
          {steps.map((step, index) => (
            <FlowStep
              key={step.label}
              step={step}
              isLast={index === steps.length - 1}
              isHero={index === steps.length - 1}
            />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
