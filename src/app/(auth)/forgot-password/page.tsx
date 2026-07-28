import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot Password — BakeryOS',
  description: 'Reset your BakeryOS account password.',
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we will send you a reset link."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
