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
import { Separator } from '@/components/ui/separator';
import { LoginTracePanel } from '@/components/auth/login-trace-panel';
import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_AUTHENTICATED_PATH } from '@/lib/auth/constants';
import { AuthClientError } from '@/lib/auth/errors';
import { loginTrace, loginTraceError, setLoginTraceSource } from '@/lib/auth/login-trace';
import { loginFormSchema, type LoginFormValues } from '@/lib/auth/schemas/auth-forms.schema';

const defaultValues: LoginFormValues = {
  email: '',
  password: '',
};

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthClientError) {
    return error.message;
  }

  return 'Unable to sign in. Please try again.';
}

export function LoginForm() {
  const router = useRouter();
  const { signIn, signInWithGoogle } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues,
  });

  const isBusy = isSubmitting || isGoogleSigningIn;

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    setLoginTraceSource('loginForm');
    loginTrace('1. Login button clicked', { email: values.email });

    try {
      await signIn({
        email: values.email,
        password: values.password,
      });
      loginTrace('8. Before router.push()', { nextPath: DEFAULT_AUTHENTICATED_PATH });
      router.push(DEFAULT_AUTHENTICATED_PATH);
      loginTrace('9. After router.push()', { nextPath: DEFAULT_AUTHENTICATED_PATH });
    } catch (error: unknown) {
      loginTraceError('10. Login onSubmit caught exception', error);
      setFormError(getAuthErrorMessage(error));
    }
  }

  async function handleGoogleSignIn() {
    setFormError(null);
    setIsGoogleSigningIn(true);

    try {
      await signInWithGoogle();
      router.push(DEFAULT_AUTHENTICATED_PATH);
    } catch (error: unknown) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setIsGoogleSigningIn(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* TEMPORARY — remove LoginTracePanel after mobile login investigation */}
      <LoginTracePanel />
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            disabled={isBusy}
            {...register('email')}
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            disabled={isBusy}
            {...register('password')}
          />
        </FormField>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={isBusy}>
          {isSubmitting ? 'Signing in…' : 'Login'}
        </Button>
      </form>

      <div className="relative">
        <Separator />
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          OR
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={isBusy}
        onClick={handleGoogleSignIn}
      >
        <GoogleIcon />
        {isGoogleSigningIn ? 'Signing in with Google…' : 'Continue with Google'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          Create account
        </Link>
      </p>
    </div>
  );
}
