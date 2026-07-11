'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { MoneyInput } from '@/components/shared/money-input';
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
import { DEFAULT_PRODUCT_CATEGORIES } from '@/lib/domain/constants/product';
import {
  productFormSchema,
  type ProductFormValues,
} from '@/lib/domain/schemas/product.schema';
import {
  focusProductFormField,
  type ProductFieldError,
} from '@/lib/utils/product-form-errors';
import type { Product } from '@/types/product';

type ProductFormProps = {
  product?: Product;
  open?: boolean;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  isSubmitting?: boolean;
  formId: string;
  autoFocus?: boolean;
  serverFieldError?: ProductFieldError | null;
  onServerFieldErrorHandled?: () => void;
};

const defaultValues: ProductFormValues = {
  code: '',
  name: '',
  category: DEFAULT_PRODUCT_CATEGORIES[0],
  sellingPrice: 0,
  description: '',
  isActive: true,
};

export function ProductForm({
  product,
  open = true,
  onSubmit,
  isSubmitting = false,
  formId,
  autoFocus = false,
  serverFieldError,
  onServerFieldErrorHandled,
}: ProductFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    trigger,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues,
  });

  const category = watch('category');
  const sellingPrice = watch('sellingPrice');
  const isActive = watch('isActive');

  useEffect(() => {
    if (!open) {
      return;
    }

    if (product) {
      reset({
        code: product.code,
        name: product.name,
        category: product.category,
        sellingPrice: product.sellingPrice,
        description: product.description ?? '',
        isActive: product.isActive,
      });
      return;
    }

    reset(defaultValues);
  }, [open, product, reset]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    const timer = window.setTimeout(() => {
      setFocus('name');
    }, 0);

    return () => window.clearTimeout(timer);
  }, [autoFocus, product, setFocus]);

  useEffect(() => {
    if (!serverFieldError) {
      return;
    }

    setError(serverFieldError.field, { type: 'server', message: serverFieldError.message });
    focusProductFormField(serverFieldError.field);
    onServerFieldErrorHandled?.();
  }, [serverFieldError, setError, onServerFieldErrorHandled]);

  function handleInvalidSubmit(fieldErrors: Partial<Record<keyof ProductFormValues, unknown>>) {
    const firstErrorField = (
      ['name', 'code', 'category', 'sellingPrice', 'description', 'isActive'] as const
    ).find((field) => fieldErrors[field]);

    if (!firstErrorField) {
      return;
    }

    if (firstErrorField === 'sellingPrice' || firstErrorField === 'category') {
      focusProductFormField(firstErrorField);
      return;
    }

    setFocus(firstErrorField);
  }

  return (
    <form
      id={formId}
      className="space-y-5"
      onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            placeholder="e.g. Sourdough Loaf"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
            disabled={isSubmitting}
            {...register('name')}
          />
          {errors.name ? (
            <p id="name-error" className="text-sm text-destructive" role="alert">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="code">Product Code</Label>
          <Input
            id="code"
            placeholder="Auto-generated if blank"
            aria-invalid={!!errors.code}
            aria-describedby={errors.code ? 'code-error' : undefined}
            disabled={isSubmitting}
            {...register('code')}
          />
          {errors.code ? (
            <p id="code-error" className="text-sm text-destructive" role="alert">
              {errors.code.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select
            value={category}
            onValueChange={(value) =>
              setValue('category', value ?? DEFAULT_PRODUCT_CATEGORIES[0], {
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
              {DEFAULT_PRODUCT_CATEGORIES.map((item) => (
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

        <div className="space-y-2">
          <Label htmlFor="sellingPrice">Selling Price *</Label>
          <MoneyInput
            id="sellingPrice"
            value={sellingPrice}
            onChange={(nextValue) =>
              setValue('sellingPrice', nextValue, { shouldValidate: false, shouldDirty: true })
            }
            onBlur={() => {
              void trigger('sellingPrice');
            }}
            disabled={isSubmitting}
            aria-invalid={!!errors.sellingPrice}
            aria-describedby={errors.sellingPrice ? 'sellingPrice-error' : undefined}
          />
          {errors.sellingPrice ? (
            <p id="sellingPrice-error" className="text-sm text-destructive" role="alert">
              {errors.sellingPrice.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Optional product description"
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

      <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor="isActive">Status</Label>
          <p className="text-sm text-muted-foreground">
            {isActive ? 'Product is active and visible in lists' : 'Product is inactive'}
          </p>
        </div>
        <Switch
          id="isActive"
          checked={isActive}
          onCheckedChange={(checked) => setValue('isActive', checked, { shouldValidate: true })}
          disabled={isSubmitting}
          aria-label={isActive ? 'Product is active' : 'Product is inactive'}
        />
      </div>
    </form>
  );
}
