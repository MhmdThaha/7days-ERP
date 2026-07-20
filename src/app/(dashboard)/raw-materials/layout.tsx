import { ModuleRouteGuard } from '@/components/shared/module-route-guard';

export default function RawMaterialsLayout({ children }: { children: React.ReactNode }) {
  return <ModuleRouteGuard module="raw-materials">{children}</ModuleRouteGuard>;
}
