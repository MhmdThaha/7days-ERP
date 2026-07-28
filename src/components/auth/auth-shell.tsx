import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-semibold">BO</span>
          </div>
          <div className="text-left">
            <p className="font-heading text-lg font-semibold">BakeryOS</p>
            <p className="text-sm text-muted-foreground">Run your bakery</p>
          </div>
        </Link>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">{children}</CardContent>
        {footer ? <div className="border-t px-(--card-spacing) py-4 text-center">{footer}</div> : null}
      </Card>
    </div>
  );
}
