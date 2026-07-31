'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { FormField } from '@/components/shared/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { AuthClientError } from '@/lib/auth/errors';
import { resolvePostAuthRedirectPath } from '@/lib/auth/resolve-post-auth-redirect';
import { loginFormSchema, type LoginFormValues } from '@/lib/auth/schemas/auth-forms.schema';
import { beginLoginTrace } from '@/lib/observability/auth-trace-context';
import { authLogClient } from '@/lib/observability/auth-logger.client';
import { AUTH_TRACE_STEPS } from '@/lib/observability/auth-trace.types';

const defaultValues: LoginFormValues = {
  email: '',
  password: '',
};

// TEMP-TRACE: remove after login-hang investigation.
function tempTrace(payload: {
  TRACE_ID: string | null;
  FUNCTION: string;
  EVENT: string;
  NEXT_STEP: string;
  [key: string]: unknown;
}) {
  try {
    console.info('[TEMP-TRACE]', {
      ...payload,
      CURRENT_URL: typeof window !== 'undefined' ? window.location.href : null,
    });
  } catch {
    // observation only
  }
}

// TEMP-TRACE: remove after login-hang investigation.
function tempTracePostPush(traceId: string, fn: string, pushedPath: string) {
  try {
    tempTrace({
      TRACE_ID: traceId,
      FUNCTION: fn,
      EVENT: 'router.push executed',
      NEXT_STEP: 'wait 1500ms then observe location',
      pushedPath,
      pathnameAtPush: window.location.pathname,
    });
    setTimeout(() => {
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: fn,
        EVENT: 'post-push check (+1500ms)',
        NEXT_STEP: 'none (final observation)',
        window_location_href: window.location.href,
        window_location_pathname: window.location.pathname,
        stillOnLogin: window.location.pathname === '/login',
        pushedPath,
      });
    }, 1500);
  } catch {
    // observation only — never interfere with the flow
  }
}

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
  const pathname = usePathname();
  const { signIn, signInWithGoogle } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  // TEMP-TRACE: remove after login-hang investigation — router transition observer
  useEffect(() => {
    tempTrace({
      TRACE_ID: null,
      FUNCTION: 'LoginForm',
      EVENT: 'router pathname observed',
      NEXT_STEP: 'watch for pathname change after router.push',
      pathname,
    });
  }, [pathname]);

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
    const traceId = beginLoginTrace('email');
    authLogClient({
      step: AUTH_TRACE_STEPS.LOGIN_BUTTON_CLICKED,
      status: 'started',
      traceId,
      meta: { method: 'email' },
    });

    // TEMP-TRACE: remove after login-hang investigation
    tempTrace({
      TRACE_ID: traceId,
      FUNCTION: 'onSubmit',
      EVENT: 'Login button clicked',
      NEXT_STEP: 'signIn()',
      method: 'email',
    });

    try {
      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'onSubmit',
        EVENT: 'signIn() started',
        NEXT_STEP: 'await AuthProvider.signIn → Firebase + session sync',
      });
      await signIn({
        email: values.email,
        password: values.password,
      });
      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'onSubmit',
        EVENT: 'signIn() finished',
        NEXT_STEP: 'resolvePostAuthRedirectPath()',
      });

      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'onSubmit',
        EVENT: 'resolvePostAuthRedirectPath() started',
        NEXT_STEP: 'await getUserProfileAction server action',
      });
      const redirectPath = await resolvePostAuthRedirectPath();
      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'onSubmit',
        EVENT: 'resolvePostAuthRedirectPath() returned',
        NEXT_STEP: `router.push('${redirectPath}')`,
        redirectPath,
      });

      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'onSubmit',
        EVENT: 'router.push() about to execute',
        NEXT_STEP: `router.push('${redirectPath}')`,
        redirectPath,
      });
      router.push(redirectPath);
      tempTracePostPush(traceId, 'onSubmit', redirectPath);
    } catch (error: unknown) {
      setFormError(getAuthErrorMessage(error));
    }
  }

  async function handleGoogleSignIn() {
    setFormError(null);
    setIsGoogleSigningIn(true);
    const traceId = beginLoginTrace('google');
    authLogClient({
      step: AUTH_TRACE_STEPS.LOGIN_BUTTON_CLICKED,
      status: 'started',
      traceId,
      meta: { method: 'google' },
    });

    // TEMP-TRACE: remove after login-hang investigation
    tempTrace({
      TRACE_ID: traceId,
      FUNCTION: 'handleGoogleSignIn',
      EVENT: 'Login button clicked',
      NEXT_STEP: 'signInWithGoogle()',
      method: 'google',
    });

    try {
      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'handleGoogleSignIn',
        EVENT: 'signIn() started',
        NEXT_STEP: 'await AuthProvider.signInWithGoogle → Firebase + session sync',
      });
      await signInWithGoogle();
      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'handleGoogleSignIn',
        EVENT: 'signIn() finished',
        NEXT_STEP: 'resolvePostAuthRedirectPath()',
      });

      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'handleGoogleSignIn',
        EVENT: 'resolvePostAuthRedirectPath() started',
        NEXT_STEP: 'await getUserProfileAction server action',
      });
      const redirectPath = await resolvePostAuthRedirectPath();
      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'handleGoogleSignIn',
        EVENT: 'resolvePostAuthRedirectPath() returned',
        NEXT_STEP: `router.push('${redirectPath}')`,
        redirectPath,
      });

      // TEMP-TRACE: remove after login-hang investigation
      tempTrace({
        TRACE_ID: traceId,
        FUNCTION: 'handleGoogleSignIn',
        EVENT: 'router.push() about to execute',
        NEXT_STEP: `router.push('${redirectPath}')`,
        redirectPath,
      });
      router.push(redirectPath);
      tempTracePostPush(traceId, 'handleGoogleSignIn', redirectPath);
    } catch (error: unknown) {
      setFormError(getAuthErrorMessage(error));
    } finally {
      setIsGoogleSigningIn(false);
    }
  }

  return (
    <div className="space-y-5">
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
