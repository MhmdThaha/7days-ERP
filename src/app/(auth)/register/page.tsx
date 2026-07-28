import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = {
  title: 'Create Account — BakeryOS',
  description: 'Create your BakeryOS account.',
};

export default function RegisterPage() {
  return (
    <AuthShell title="Create your account" description="Get started with BakeryOS in minutes.">
      <RegisterForm />
    </AuthShell>
  );
}
