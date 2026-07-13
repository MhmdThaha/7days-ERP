'use client';

import { Info } from 'lucide-react';

import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AVERAGE_COST_HELP_TEXT } from '@/lib/domain/constants/inventory';
import { cn } from '@/lib/utils';

type AverageCostLabelProps = {
  htmlFor?: string;
  className?: string;
  required?: boolean;
};

export function AverageCostLabel({ htmlFor, className, required = false }: AverageCostLabelProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        Average Cost{required ? ' *' : ''}
      </Label>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="About average cost"
            >
              <Info className="size-3.5" aria-hidden="true" />
            </button>
          }
        />
        <TooltipContent side="top" className="max-w-xs">
          {AVERAGE_COST_HELP_TEXT}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export { AVERAGE_COST_HELP_TEXT };
