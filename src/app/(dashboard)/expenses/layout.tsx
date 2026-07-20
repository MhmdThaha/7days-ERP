import { ModuleRouteGuard } from '@/components/shared/module-route-guard';

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return <ModuleRouteGuard module="expenses">{children}</ModuleRouteGuard>;
}
