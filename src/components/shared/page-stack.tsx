import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { pageStack, pageStackLoose } from '@/lib/ui/layout';

type PageStackProps = {
  children: ReactNode;
  className?: string;
  density?: 'default' | 'loose';
};

export function PageStack({ children, className, density = 'default' }: PageStackProps) {
  return (
    <div className={cn(density === 'loose' ? pageStackLoose : pageStack, className)}>{children}</div>
  );
}
