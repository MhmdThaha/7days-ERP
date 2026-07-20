import { ModuleRouteGuard } from '@/components/shared/module-route-guard';

export default function RecipesLayout({ children }: { children: React.ReactNode }) {
  return <ModuleRouteGuard module="recipes">{children}</ModuleRouteGuard>;
}
