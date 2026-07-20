import { ModuleRouteGuard } from '@/components/shared/module-route-guard';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <ModuleRouteGuard module="settings">{children}</ModuleRouteGuard>;
}
