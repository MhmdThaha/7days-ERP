'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

import { UserMenu } from '@/components/layout/user-menu';

function formatBusinessDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function TopBar() {
  const today = formatBusinessDate(new Date());

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <span className="hidden font-semibold sm:inline">7Days Bakery</span>
      <div className="flex flex-1 items-center justify-center sm:justify-start">
        <span className="text-sm text-muted-foreground">Today: {today}</span>
      </div>
      <UserMenu />
    </header>
  );
}
