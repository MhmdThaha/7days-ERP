import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Login — BakeryOS',
  description: 'Sign in to your BakeryOS workspace.',
};

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" description="Sign in to manage your bakery.">
      <LoginForm />
    </AuthShell>
  );
}
