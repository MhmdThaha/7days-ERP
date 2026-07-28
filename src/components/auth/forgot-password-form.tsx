'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { FormField } from '@/components/shared/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { AuthClientError } from '@/lib/auth/errors';
import {
  forgotPasswordFormSchema,
  type ForgotPasswordFormValues,
} from '@/lib/auth/schemas/auth-forms.schema';

const defaultValues: ForgotPasswordFormValues = {
  email: '',
};

export function ForgotPasswordForm() {
  const { sendPasswordReset } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues,
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setFormError(null);
    setIsSuccess(false);

    try {
      await sendPasswordReset(values.email);
      setSubmittedEmail(values.email);
      setIsSuccess(true);
    } catch (error: unknown) {
      if (error instanceof AuthClientError) {
        setFormError(error.message);
        return;
      }

      setFormError('Unable to send reset link. Please try again.');
    }
  }

  if (isSuccess) {
    return (
      <div className="space-y-5">
        <Alert variant="success">
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            If an account exists for {submittedEmail}, we sent a password reset link.
          </AlertDescription>
        </Alert>

        <Button nativeButton={false} variant="outline" className="w-full" render={<Link href="/login" />}>
          Back to login
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

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

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Send reset link'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remember your password?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
