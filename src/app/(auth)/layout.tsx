import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-full flex-1 flex-col">{children}</main>;
}
