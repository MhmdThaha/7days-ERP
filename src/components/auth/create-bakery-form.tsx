'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { createBakeryAction } from '@/actions/bakery';
import { FormField } from '@/components/shared/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_AUTHENTICATED_PATH } from '@/lib/auth/constants';
import {
  createBakeryFormSchema,
  type CreateBakeryFormValues,
} from '@/lib/auth/schemas/create-bakery.schema';

export function CreateBakeryForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateBakeryFormValues>({
    resolver: zodResolver(createBakeryFormSchema),
    defaultValues: {
      bakeryName: '',
    },
  });

  async function onSubmit(values: CreateBakeryFormValues) {
    setErrorMessage(null);

    const email = user?.email ?? '';
    const displayName = user?.displayName ?? '';

    const result = await createBakeryAction({
      bakeryName: values.bakeryName,
      email,
      displayName,
    });

    if (!result.success) {
      setErrorMessage(result.error);
      return;
    }

    router.replace(DEFAULT_AUTHENTICATED_PATH);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <FormField
        label="Bakery name"
        htmlFor="bakeryName"
        required
        error={errors.bakeryName?.message}
      >
        <Input
          id="bakeryName"
          autoComplete="organization"
          placeholder="7 Days Bakery"
          aria-invalid={!!errors.bakeryName}
          disabled={isSubmitting}
          {...register('bakeryName')}
        />
      </FormField>

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Creating bakery...' : 'Create bakery'}
      </Button>
    </form>
  );
}
