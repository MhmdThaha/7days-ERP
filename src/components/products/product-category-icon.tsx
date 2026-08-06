import type { LucideIcon } from 'lucide-react';
import {
  Cake,
  ChefHat,
  Coffee,
  Cookie,
  Package,
  Sandwich,
  Wheat,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Bread: Wheat,
  Pastry: ChefHat,
  Cake,
  Cookie,
  Savory: Sandwich,
  Beverage: Coffee,
  Other: Package,
};

type ProductCategoryIconProps = {
  category: string;
  className?: string;
};

export function ProductCategoryIcon({ category, className }: ProductCategoryIconProps) {
  const Icon = CATEGORY_ICONS[category] ?? Package;

  return (
    <Icon
      className={cn('size-4 shrink-0 text-muted-foreground', className)}
      aria-hidden="true"
    />
  );
}
