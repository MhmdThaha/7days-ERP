'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { NAV_ICONS } from '@/components/layout/nav-icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { quickAddActions } from '@/lib/navigation/quick-add-actions';
import { cn } from '@/lib/utils';

type QuickAddMenuProps = {
  allowedModules: readonly string[];
};

export function QuickAddMenu({ allowedModules }: QuickAddMenuProps) {
  const visibleActions = quickAddActions.filter((action) =>
    allowedModules.includes(action.module),
  );

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground',
          'transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        )}
        aria-label="Quick Add — start a common task"
      >
        <Plus className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Quick Add</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Start a task</DropdownMenuLabel>
          {visibleActions.map((action) => {
            const Icon = NAV_ICONS[action.icon];

            return (
              <DropdownMenuItem key={action.href} render={<Link href={action.href} />}>
                <Icon className="size-4" aria-hidden="true" />
                {action.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
