import { ModuleRouteGuard } from '@/components/shared/module-route-guard';

export default function PurchasesLayout({ children }: { children: React.ReactNode }) {
  return <ModuleRouteGuard module="purchases">{children}</ModuleRouteGuard>;
}
