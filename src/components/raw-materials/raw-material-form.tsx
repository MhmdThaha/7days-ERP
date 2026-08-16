'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { RawMaterialInventoryNotice } from '@/components/raw-materials/raw-material-inventory-notice';
import { AverageCostLabel } from '@/components/shared/average-cost-label';
import { MoneyDisplay } from '@/components/shared/money-display';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AVERAGE_COST_HELP_TEXT } from '@/lib/domain/constants/inventory';
import {
  DEFAULT_RAW_MATERIAL_CATEGORIES,
  DEFAULT_RAW_MATERIAL_UNITS,
} from '@/lib/domain/constants/raw-material';
import {
  rawMaterialFormSchema,
  type RawMaterialFormValues,
} from '@/lib/domain/schemas/raw-material.schema';
import {
  focusRawMaterialFormField,
  type RawMaterialFieldError,
} from '@/lib/utils/raw-material-form-errors';
import type { RawMaterial } from '@/types/raw-material';

type RawMaterialFormProps = {
  rawMaterial?: RawMaterial;
  open?: boolean;
  onSubmit: (values: RawMaterialFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  autoFocus?: boolean;
  serverFieldError?: RawMaterialFieldError | null;
  onServerFieldErrorHandled?: () => void;
};

const defaultValues: RawMaterialFormValues = {
  code: '',
  name: '',
  category: DEFAULT_RAW_MATERIAL_CATEGORIES[0],
  unit: DEFAULT_RAW_MATERIAL_UNITS[0],
  reorderLevel: null,
  description: '',
  isActive: true,
};

export function RawMaterialForm({
  rawMaterial,
  open = true,
  onSubmit,
  isSubmitting = false,
  formId,
  autoFocus = false,
  serverFieldError,
  onServerFieldErrorHandled,
}: RawMaterialFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    watch,
    reset,
    formState: { errors },
  } = useForm<RawMaterialFormValues>({
    resolver: zodResolver(rawMaterialFormSchema),
    defaultValues,
  });

  const category = watch('category');
  const unit = watch('unit');
  const reorderLevel = watch('reorderLevel');
  const isActive = watch('isActive');

  useEffect(() => {
    if (!open) {
      return;
    }

    if (rawMaterial) {
      reset({
        code: rawMaterial.code,
        name: rawMaterial.name,
        category: rawMaterial.category,
        unit: rawMaterial.unit,
        reorderLevel: rawMaterial.reorderLevel,
        description: rawMaterial.description ?? '',
        isActive: rawMaterial.isActive,
      });
      return;
    }

    reset(defaultValues);
  }, [open, rawMaterial, reset]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    const timer = window.setTimeout(() => {
      setFocus('name');
    }, 0);

    return () => window.clearTimeout(timer);
  }, [autoFocus, rawMaterial, setFocus]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field, { type: 'server', message: serverFieldError.message });
    focusRawMaterialFormField(serverFieldError.field);
    onServerFieldErrorHandled?.();
  }, [serverFieldError, setError, onServerFieldErrorHandled]);

  function handleInvalidSubmit(fieldErrors: Partial<Record<keyof RawMaterialFormValues, unknown>>) {
    const firstErrorField = (
      ['name', 'code', 'category', 'unit', 'reorderLevel', 'description', 'isActive'] as const
    ).find((field) => fieldErrors[field]);

    if (!firstErrorField) {
      return;
    }

    if (firstErrorField === 'category' || firstErrorField === 'unit') {
      focusRawMaterialFormField(firstErrorField);
      return;
    }

    setFocus(firstErrorField);
  }

  return (
    <form
      id={formId}
      className="space-y-6"
      onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
      noValidate
    >
      {!rawMaterial ? <RawMaterialInventoryNotice compact /> : null}

      <fieldset className="space-y-4" disabled={isSubmitting}>
        <legend className="sr-only">Basic details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2 sm:max-w-none">
            <Label htmlFor="name">Raw Material Name *</Label>
            <Input
              id="name"
              placeholder="e.g. All-Purpose Flour"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : 'name-hint'}
              disabled={isSubmitting}
              {...register('name')}
            />
            {errors.name ? (
              <p id="name-error" className="text-sm text-destructive" role="alert">
                {errors.name.message}
              </p>
            ) : (
              <p id="name-hint" className="text-sm text-muted-foreground">
                The name your team will see when buying ingredients or building recipes.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Material Code</Label>
            <Input
              id="code"
              placeholder="Auto-generated if blank"
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? 'code-error' : 'code-hint'}
              disabled={isSubmitting}
              {...register('code')}
            />
            {errors.code ? (
              <p id="code-error" className="text-sm text-destructive" role="alert">
                {errors.code.message}
              </p>
            ) : (
              <p id="code-hint" className="text-sm text-muted-foreground">
                Optional. Leave blank to auto-generate (e.g. RM-001).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select
              value={category}
              onValueChange={(value) =>
                setValue('category', value ?? DEFAULT_RAW_MATERIAL_CATEGORIES[0], {
                  shouldValidate: true,
                })
              }
              disabled={isSubmitting}
            >
              <SelectTrigger
                id="category"
                className="w-full"
                aria-invalid={!!errors.category}
                aria-describedby={errors.category ? 'category-error' : undefined}
              >
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_RAW_MATERIAL_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category ? (
              <p id="category-error" className="text-sm text-destructive" role="alert">
                {errors.category.message}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t pt-6" disabled={isSubmitting}>
        <legend className="sr-only">Units and stock alerts</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="unit">Unit of Measure *</Label>
            <Select
              value={unit}
              onValueChange={(value) =>
                setValue('unit', value ?? DEFAULT_RAW_MATERIAL_UNITS[0], {
                  shouldValidate: true,
                })
              }
              disabled={isSubmitting || Boolean(rawMaterial)}
            >
              <SelectTrigger
                id="unit"
                className="w-full"
                aria-invalid={!!errors.unit}
                aria-describedby={errors.unit ? 'unit-error' : 'unit-hint'}
              >
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_RAW_MATERIAL_UNITS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.unit ? (
              <p id="unit-error" className="text-sm text-destructive" role="alert">
                {errors.unit.message}
              </p>
            ) : (
              <p id="unit-hint" className="text-sm text-muted-foreground">
                {rawMaterial
                  ? 'Unit cannot be changed after the material is created.'
                  : 'How you buy and track this ingredient (e.g. kg, L, piece).'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reorderLevel">Reorder Level</Label>
            <Input
              id="reorderLevel"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="Optional"
              value={reorderLevel ?? ''}
              onChange={(event) => {
                const nextValue = event.target.value;

                setValue('reorderLevel', nextValue === '' ? null : Number(nextValue), {
                  shouldValidate: true,
                });
              }}
              aria-invalid={!!errors.reorderLevel}
              aria-describedby={errors.reorderLevel ? 'reorderLevel-error' : 'reorderLevel-hint'}
              disabled={isSubmitting}
              className="max-w-full tabular-nums sm:max-w-[160px]"
            />
            {errors.reorderLevel ? (
              <p id="reorderLevel-error" className="text-sm text-destructive" role="alert">
                {errors.reorderLevel.message}
              </p>
            ) : (
              <p id="reorderLevel-hint" className="text-sm text-muted-foreground">
                Optional. Get a low-stock alert when quantity falls to this level or below
                {unit ? ` (in ${unit})` : ''}.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {rawMaterial ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 px-4 py-4">
          <div>
            <p className="text-sm font-medium">Inventory (read-only)</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Updated automatically from Purchases and Production — not editable here.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Current Stock
              </p>
              <p className="text-sm font-medium tabular-nums">
                {rawMaterial.currentStock} {rawMaterial.unit}
              </p>
            </div>
            <div className="space-y-1">
              <AverageCostLabel />
              <p className="text-xs text-muted-foreground">{AVERAGE_COST_HELP_TEXT}</p>
              <p className="text-sm font-medium tabular-nums">
                {rawMaterial.averageCost > 0 ? (
                  <MoneyDisplay amount={rawMaterial.averageCost} />
                ) : (
                  <span className="text-muted-foreground">No purchases recorded yet</span>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <fieldset className="space-y-4 border-t pt-6" disabled={isSubmitting}>
        <legend className="sr-only">Additional details</legend>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Optional notes about brand, supplier, or storage"
            rows={3}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? 'description-error' : undefined}
            disabled={isSubmitting}
            className="resize-none"
            {...register('description')}
          />
          {errors.description ? (
            <p id="description-error" className="text-sm text-destructive" role="alert">
              {errors.description.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="isActive">Status</Label>
            <p className="text-sm text-muted-foreground">
              {isActive
                ? 'Active materials appear in purchases and recipes'
                : 'Inactive materials are hidden from new purchases and recipes'}
            </p>
          </div>
          <Switch
            id="isActive"
            checked={isActive}
            onCheckedChange={(checked) => setValue('isActive', checked, { shouldValidate: true })}
            disabled={isSubmitting}
            aria-label={isActive ? 'Material is active' : 'Material is inactive'}
            className="shrink-0"
          />
        </div>
      </fieldset>
    </form>
  );
}
