'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type TruncatedTextProps = {
  text: string;
  className?: string;
  maxWidthClassName?: string;
};

export function TruncatedText({
  text,
  className,
  maxWidthClassName = 'max-w-[200px]',
}: TruncatedTextProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn('block truncate', maxWidthClassName, className)}
            tabIndex={0}
          />
        }
      >
        {text}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
