import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { sectionStack } from '@/lib/ui/layout';

type SectionHeaderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  headingId?: string;
};

export function SectionHeader({
  title,
  description,
  children,
  className,
  headingId,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className={sectionStack}>
        <h2
          id={headingId}
          className="text-base font-semibold tracking-tight text-foreground md:text-lg"
        >
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
