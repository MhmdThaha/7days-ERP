'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { FormField } from '@/components/shared/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_AUTHENTICATED_PATH } from '@/lib/auth/constants';
import { AuthClientError } from '@/lib/auth/errors';
import {
  registerFormSchema,
  type RegisterFormValues,
} from '@/lib/auth/schemas/auth-forms.schema';

const defaultValues: RegisterFormValues = {
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export function RegisterForm() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues,
  });

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null);

    try {
      await signUp({
        email: values.email,
        password: values.password,
        displayName: values.displayName,
      });
      router.push(DEFAULT_AUTHENTICATED_PATH);
    } catch (error: unknown) {
      if (error instanceof AuthClientError) {
        setFormError(error.message);
        return;
      }

      setFormError('Unable to create your account. Please try again.');
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FormField label="Name" htmlFor="displayName" required error={errors.displayName?.message}>
        <Input
          id="displayName"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.displayName}
          disabled={isSubmitting}
          {...register('displayName')}
        />
      </FormField>

      <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          disabled={isSubmitting}
          {...register('email')}
        />
      </FormField>

      <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          disabled={isSubmitting}
          {...register('password')}
        />
      </FormField>

      <FormField
        label="Confirm Password"
        htmlFor="confirmPassword"
        required
        error={errors.confirmPassword?.message}
      >
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          disabled={isSubmitting}
          {...register('confirmPassword')}
        />
      </FormField>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
