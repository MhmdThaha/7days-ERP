import { ModuleRouteGuard } from '@/components/shared/module-route-guard';

export default function WastageLayout({ children }: { children: React.ReactNode }) {
  return <ModuleRouteGuard module="wastage">{children}</ModuleRouteGuard>;
}
